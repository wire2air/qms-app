/**
 * Where the Support Desk's ticket screens live: inside the desk portal
 * (/desk/…), not the QMS shell. The old /customer-complaints addresses
 * redirect here (pages/customer-complaints), so e-mails and saved links keep
 * working. Paths are tenant-relative; wrap them in getCompanyPath.
 */
export const TICKETS_PATH = '/desk/tickets'

/** The tickets list, one ticket, or (id 'new') a new ticket. */
export function ticketPath(id = null) {
  return id ? `${TICKETS_PATH}/${id}` : TICKETS_PATH
}
export const NEW_TICKET_PATH = `${TICKETS_PATH}/new`
export const TICKET_REPORTS_PATH = '/desk/reports'
