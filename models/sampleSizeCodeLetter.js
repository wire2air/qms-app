import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// Lot-size range → sample-size code letter, per standard + inspection level.
@ClientModel('sampleSizeCodeLetters', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'standardId' })
export class SampleSizeCodeLetter extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) standardId = ''
  @Property({ type: String }) companyId = /** @type {String} */ (null)
  @Property({ type: Number, required: true }) lotMin = 0
  @Property({ type: Number, required: true }) lotMax = 0
  @Property({ type: String, required: true }) inspectionLevel = ''
  @Property({ type: String, required: true }) codeLetter = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
