import { KeyRound, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ApiError } from '@/lib/api'
import { deviceId, remember } from '@/lib/session'

/** A short, friendly name for the device, so /status is readable later. */
const guessLabel = (): string => {
  const agent = navigator.userAgent
  if (/iphone/i.test(agent)) return 'iPhone'
  if (/ipad/i.test(agent)) return 'iPad'
  if (/android/i.test(agent)) return 'Android'
  if (/mac/i.test(agent)) return 'Mac'
  if (/windows/i.test(agent)) return 'Windows'
  return 'Браузер'
}

/**
 * The gate. Everything else needs a token, so this is what an unauthorized
 * install sees instead of the feed.
 */
/** Why the code was refused, in terms of what the person can do about it. */
const DENIALS: Record<string, string> = {
  'username-mismatch':
    'Этот код выдан для Telegram-аккаунта — для веб-приложения попросите код без привязки к @username.',
  expired: 'Срок действия кода истёк — попросите новый.',
  'not-found': 'Неверный или уже использованный код.',
}

const loginError = (caught: unknown): string => {
  if (!(caught instanceof ApiError)) return 'Не удалось войти. Попробуйте ещё раз.'
  if (caught.status === 503) return 'Сервис недоступен. Попробуйте позже.'
  return DENIALS[caught.message] ?? 'Неверный или уже использованный код.'
}

export function LoginPage({ onAuthorized }: { onAuthorized: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = code.trim()
    if (!value || busy) return

    setBusy(true)
    setError(null)

    try {
      const result = await api.authorize(deviceId(), value, guessLabel())
      remember({ token: result.token, role: result.role })
      onAuthorized()
    } catch (caught) {
      setError(loginError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            Код доступа
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Введите код, выданный командой <code>/user_sign</code> в боте.
          </p>

          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder="например, xK3p-Rd9Qm2A"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={busy || !code.trim()}
            onClick={submit}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Войти
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
