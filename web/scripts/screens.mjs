/** Screen id → hash route. Shared by the diff script and the Playwright specs. */
export const SCREENS = {
  'S-00': '/template',
  'S-01': '/new',
  'S-02': '/scan',
  'S-03': '/preflight',
  'S-04': '/workspace',
  'S-05': '/estimate',
  'S-06': '/fix',
  'S-07': '/loop',
  'S-09': '/report',
  'S-10': '/export',
  'S-11': '/pr',
  'S-12': '/repo',
  'S-13': '/runs',
  'S-14': '/leaderboard',
  'S-15': '/screening',
  'S-16': '/bench',
  'S-17': '/signin',
  'S-18': '/signup',
  'S-19': '/account',
  /** The small-screen gate (S-20/S-21); its target is drawn at phone and tablet sizes, so diff skips it. */
  'S-20': '/gate',
}
