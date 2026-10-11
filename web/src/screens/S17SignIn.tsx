/* S-17 · Sign in (board OVD-0, states QA6-0): anyone signed out decides which account owns their runs. */
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell } from '../ui/Shell'
import { AccountStatus } from './account/parts'
import { SignInForm } from './account/SignInForm'

export function S17SignIn() {
  const state = useHashParams().get('state')
  return (
    <Shell context="Account" rail="account" status={<AccountStatus />} tabs={<div className="tabstrip" aria-hidden />} inspector={null}>
      <Content className="acc-center">
        {/* Remount per state so each opens with its own starting values. */}
        <SignInForm key={state ?? 'main'} view={state} onSignedIn={() => navigate(ROUTES.account)} />
      </Content>
    </Shell>
  )
}
