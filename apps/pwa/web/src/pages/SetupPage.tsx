import { useState } from 'react'
import {
  ArrowLeft,
  BellRing,
  Check,
  KeyRound,
  Share,
  Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { usePush } from '@/hooks/pushContext'
import { api } from '@/lib/api'
import { currentEndpoint } from '@/lib/push'
import { navigate } from '@/lib/router'
import { cn } from '@/lib/utils'

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

function StepShell({
  index,
  title,
  icon: Icon,
  done,
  active,
  children,
}: {
  index: number
  title: string
  icon: typeof BellRing
  done: boolean
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Card className={cn(!active && !done && 'opacity-60')}>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium',
            done
              ? 'bg-success text-background'
              : active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="size-4" /> : index}
        </span>
        <CardTitle className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SetupPage() {
  const push = usePush()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const installed = push.standalone
  const notificationsOn = push.subscribed && push.permission === 'granted'

  const enableNotifications = async () => {
    setBusy(true)
    try {
      await push.subscribe()
      toast.success('Уведомления включены')
    } catch {
      toast.error(
        push.permission === 'denied'
          ? 'Уведомления заблокированы в настройках'
          : 'Не удалось включить уведомления',
      )
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async () => {
    setBusy(true)
    try {
      const result = await push.authorize(code)
      if (result.authorized) toast.success('Устройство авторизовано')
      else toast.error('Неверный код')
    } catch {
      toast.error('Не удалось проверить код')
    } finally {
      setBusy(false)
      setCode('')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="size-4" />
        К ленте
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Настройка уведомлений</h1>
        <p className="text-muted-foreground text-sm">
          Три коротких шага, чтобы события приходили на это устройство.
        </p>
      </div>

      {!push.supported && (
        <Alert variant="warning">
          <Smartphone />
          <AlertTitle>Браузер не поддерживает push</AlertTitle>
          <AlertDescription>
            Откройте приложение в Safari (iOS 16.4+), Chrome или Edge.
          </AlertDescription>
        </Alert>
      )}

      <StepShell
        index={1}
        title="Установить на устройство"
        icon={Smartphone}
        done={installed}
        active={!installed}
      >
        {installed ? (
          <p className="text-success text-sm">Приложение установлено.</p>
        ) : isIOS ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            Нажмите <Share className="size-4" /> «Поделиться» → «На экран
            «Домой»», затем откройте приложение с экрана.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Откройте меню браузера и выберите «Установить приложение».
          </p>
        )}
      </StepShell>

      <StepShell
        index={2}
        title="Разрешить уведомления"
        icon={BellRing}
        done={notificationsOn}
        active={installed && !notificationsOn}
      >
        {notificationsOn ? (
          <div className="flex items-center justify-between">
            <p className="text-success text-sm">Уведомления включены.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => push.unsubscribe()}
            >
              Отключить
            </Button>
          </div>
        ) : push.permission === 'denied' ? (
          <Alert variant="warning">
            <BellRing />
            <AlertTitle>Уведомления заблокированы</AlertTitle>
            <AlertDescription>
              Включите их в настройках сайта в браузере, затем обновите
              страницу.
            </AlertDescription>
          </Alert>
        ) : (
          <Button
            className="w-full"
            disabled={busy || !push.supported}
            onClick={enableNotifications}
          >
            <BellRing className="size-4" />
            Разрешить уведомления
          </Button>
        )}
      </StepShell>

      <StepShell
        index={3}
        title="Авторизовать устройство"
        icon={KeyRound}
        done={push.authorized}
        active={notificationsOn && !push.authorized}
      >
        {push.authorized ? (
          <p className="text-success text-sm">Устройство авторизовано.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Введите код доступа, чтобы получать события.
            </p>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={busy || !notificationsOn}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="w-full"
              disabled={busy || code.length < 6}
              onClick={submitCode}
            >
              Подтвердить
            </Button>
          </div>
        )}
      </StepShell>

      {notificationsOn && (
        <Card>
          <CardHeader>
            <CardTitle>Это устройство</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Статус</span>
              <Badge variant={push.authorized ? 'success' : 'warning'}>
                {push.authorized ? 'Активно' : 'Ожидает кода'}
              </Badge>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                const endpoint = await currentEndpoint()
                if (!endpoint) return
                await api.testPush(endpoint)
                toast.info('Тестовое уведомление отправлено')
              }}
            >
              Отправить тест-уведомление
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
