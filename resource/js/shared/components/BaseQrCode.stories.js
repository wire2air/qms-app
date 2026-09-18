import BaseQrCode from './BaseQrCode.vue'

/** BaseQrCode — SVG QR code for asset tags / record links / label printing. */
export default {
  title: 'Media/BaseQrCode',
  component: BaseQrCode,
  tags: ['autodocs'],
  argTypes: {
    errorCorrectionLevel: { control: 'inline-radio', options: ['L', 'M', 'Q', 'H'] },
    size: { control: 'number' },
  },
  args: { value: 'https://qms.example.com/records/REC-2026-0042', size: 160, errorCorrectionLevel: 'M' },
}

export const Default = {
  render: (args) => ({
    components: { BaseQrCode },
    setup: () => ({ args }),
    template: `<div class="tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:inline-block"><BaseQrCode v-bind="args" /></div>`,
  }),
}

export const AssetTag = { ...Default, args: { value: 'ASSET-00421', size: 120, errorCorrectionLevel: 'H' } }
