import {
  Activity,
  Monitor,
  Moon,
  Radar,
  Settings,
  Sun,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type Theme, useTheme } from '@/hooks/useTheme'
import { Link, navigate } from '@/lib/router'
import { StatusDot, type Status } from './StatusDot'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Системная', icon: Monitor },
]

export function Header({ status }: { status: Status }) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Radar className="text-primary size-5" />
          <span>Spotter</span>
        </Link>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Камеры"
                onClick={() => navigate('/cameras')}
              >
                <Video className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Камеры</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Состояние сервисов"
                onClick={() => navigate('/status')}
              >
                <Activity className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Состояние сервисов</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Статус уведомлений"
                onClick={() => navigate('/setup')}
              >
                <StatusDot status={status} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Статус уведомлений</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Тема оформления">
                <Sun className="size-5 dark:hidden" />
                <Moon className="hidden size-5 dark:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Тема</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={theme === value}
                  onCheckedChange={() => setTheme(value)}
                >
                  <Icon className="size-4" />
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Настройки"
            onClick={() => navigate('/setup')}
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
