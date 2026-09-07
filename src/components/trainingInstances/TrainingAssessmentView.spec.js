import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TrainingAssessmentView from './TrainingAssessmentView.vue'

/**
 * Correct-answer highlighting after the answer-key split.
 *
 * The correct answers used to ride inside `training_instances.snapshot`, which
 * syncs into every assigned learner's IndexedDB — so the person being assessed
 * could read the key out of devtools before answering. The key now lives in a
 * table `app_user` holds no privilege on, and reviewers fetch it from a
 * permission-gated endpoint.
 *
 * That leaves this component with two shapes to support, and one that must
 * never change:
 *
 *   - `answerKey` provided (current instances) → highlight from the key
 *   - no `answerKey`, options still carry `isCorrect` (legacy instances
 *     launched before the split) → highlight from the inline flag
 *   - `showCorrect` false (the LEARNER's own view) → never reveal anything,
 *     whatever data happens to be present
 *
 * The last one is the security-relevant assertion: the learner's view has
 * always defaulted `showCorrect` to false, and that is what kept the highlight
 * off even while the data was there.
 */
const QUESTIONS_SANITISED = [
  {
    id: 'q1',
    prompt: 'Which one?',
    options: [
      { id: 'a', text: 'right' },
      { id: 'b', text: 'wrong' },
    ],
  },
]

const QUESTIONS_LEGACY = [
  {
    id: 'q1',
    prompt: 'Which one?',
    options: [
      { id: 'a', text: 'right', isCorrect: true },
      { id: 'b', text: 'wrong', isCorrect: false },
    ],
  },
]

function render(props) {
  return mount(TrainingAssessmentView, {
    props: { answers: { q1: 'a' }, readonly: true, ...props },
    global: { stubs: { IconCheck: true, IconX: true } },
  })
}

/** The state classes the component assigns are the observable behaviour. */
function markup(wrapper) {
  return wrapper.html()
}

describe('TrainingAssessmentView correct-answer highlighting', () => {
  it('highlights from the fetched answer key when the snapshot is sanitised', () => {
    const wrapper = render({
      questions: QUESTIONS_SANITISED,
      showCorrect: true,
      answerKey: { q1: ['a'] },
    })
    // The chosen option is the correct one, so the component must be able to
    // say so using only the key — the options carry no isCorrect at all.
    expect(markup(wrapper)).toBeTruthy()
    expect(wrapper.vm.optionState(QUESTIONS_SANITISED[0], { id: 'a' })).toBe('correctSelected')
    expect(wrapper.vm.optionState(QUESTIONS_SANITISED[0], { id: 'b' })).toBe('idle')
  })

  it('marks a wrong selection and the missed correct option', () => {
    const wrapper = render({
      questions: QUESTIONS_SANITISED,
      answers: { q1: 'b' },
      showCorrect: true,
      answerKey: { q1: ['a'] },
    })
    expect(wrapper.vm.optionState(QUESTIONS_SANITISED[0], { id: 'b' })).toBe('wrongSelected')
    expect(wrapper.vm.optionState(QUESTIONS_SANITISED[0], { id: 'a' })).toBe('correctMissed')
  })

  it('LEGACY: falls back to inline isCorrect when no key was fetched', () => {
    // Instances launched before the split still carry the flags. Reviewers must
    // keep seeing highlighting on those, or the fix would silently break every
    // historical record's review screen.
    const wrapper = render({ questions: QUESTIONS_LEGACY, showCorrect: true, answerKey: null })
    expect(wrapper.vm.optionState(QUESTIONS_LEGACY[0], QUESTIONS_LEGACY[0].options[0])).toBe(
      'correctSelected',
    )
  })

  it('prefers the fetched key over a stale inline flag', () => {
    const wrapper = render({
      questions: QUESTIONS_LEGACY,
      showCorrect: true,
      answerKey: { q1: ['b'] },
    })
    // The key is authoritative — it is what the server graded against.
    expect(wrapper.vm.optionState(QUESTIONS_LEGACY[0], { id: 'b' })).toBe('correctMissed')
  })

  it('reveals NOTHING when showCorrect is false, even with a key present', () => {
    // This is the learner's own view. It must not leak correctness regardless of
    // what data reached the component.
    const wrapper = render({
      questions: QUESTIONS_LEGACY,
      showCorrect: false,
      answerKey: { q1: ['a'] },
    })
    expect(wrapper.vm.optionState(QUESTIONS_LEGACY[0], { id: 'a' })).toBe('selected')
    expect(wrapper.vm.optionState(QUESTIONS_LEGACY[0], { id: 'b' })).toBe('idle')
  })
})
