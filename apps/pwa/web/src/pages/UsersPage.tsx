import { Copy, LoaderCircle, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { ManagedUser, Role } from '@/lib/types'

const ROLES: Array<{ code: Role; label: string }> = [
  { code: 'VIEWER', label: 'Наблюдатель' },
  { code: 'USER', label: 'Пользователь' },
  { code: 'ADMIN', label: 'Администратор' },
]

const roleLabel = (role: Role): string =>
  ROLES.find((entry) => entry.code === role)?.label ?? role

/** How to address a recipient: whichever identity it actually has. */
const displayName = (user: ManagedUser): string => {
  if (user.username) return `@${user.username}`
  if (user.tgUserId) return `#${user.tgUserId}`
  if (user.deviceId) return 'Устройство (PWA)'
  return user.uuid.slice(0, 8)
}

function SignCard({ onSigned }: { onSigned: () => void }) {
  const [role, setRole] = useState<Role>('USER')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sign = async () => {
    setBusy(true)
    try {
      const result = await api.signUser(role, username.trim() || undefined)
      setCode(result.data.code)
      onSigned()
    } catch {
      toast.error('Не удалось создать код')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4" />
          Выдать доступ
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ROLES.map((entry) => (
            <Button
              key={entry.code}
              size="sm"
              variant={role === entry.code ? 'default' : 'outline'}
              onClick={() => setRole(entry.code)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="@username в Telegram (необязательно)"
          autoCapitalize="off"
          spellCheck={false}
        />
        <p className="text-muted-foreground text-xs">
          Без имени код подойдёт и для браузера, и для бота. С именем — только
          указанному пользователю Telegram.
        </p>

        <Button className="w-full" disabled={busy} onClick={sign}>
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          Создать код
        </Button>

        {code && (
          <div className="bg-muted flex items-center justify-between gap-2 rounded-lg p-2">
            <code className="truncate text-sm">{code}</code>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Скопировать код"
              onClick={() => {
                navigator.clipboard?.writeText(code)
                toast.success('Код скопирован')
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .users()
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [])

  useEffect(load, [load])

  const change = async (user: ManagedUser, role: Role) => {
    setBusy(user.uuid)
    try {
      await api.setUserRole(user.uuid, role)
      toast.success(`${displayName(user)} — ${roleLabel(role)}`)
      load()
    } catch {
      toast.error('Не удалось изменить роль')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (user: ManagedUser) => {
    setBusy(user.uuid)
    try {
      await api.revokeUser(user.uuid)
      toast.success(`Доступ ${displayName(user)} отозван`)
      load()
    } catch {
      toast.error('Не удалось отозвать доступ')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="size-5" />
        Пользователи
      </h1>

      <SignCard onSigned={load} />

      {users === null && <Skeleton className="h-24 w-full rounded-xl" />}

      <div className="space-y-3">
        {users?.map((user) => (
          <Card key={user.uuid}>
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(user)}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.uuid.slice(0, 8)}
                  </p>
                </div>
                <Badge variant="secondary">{roleLabel(user.role)}</Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {ROLES.filter((entry) => entry.code !== user.role).map(
                  (entry) => (
                    <Button
                      key={entry.code}
                      size="sm"
                      variant="outline"
                      disabled={busy === user.uuid}
                      onClick={() => change(user, entry.code)}
                    >
                      {entry.label}
                    </Button>
                  ),
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === user.uuid}
                  onClick={() => revoke(user)}
                >
                  Отозвать
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
