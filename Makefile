# ═══════════════════════════════════════════════════════════════════════
#  Spotter — короткие алиасы над длинными docker compose командами.
#  Всё запускается из корня репозитория (пути к .docker/.deployment — относительные).
#
#  Первый запуск:   make single | make cloud | make ingest
#  Обновить вручную: make update MODE=cloud
#  Прочее:          make ps | make logs s=server | make down | make token
#
#  Отключить авто-обновление (Watchtower): добавь WATCHTOWER=0, напр.
#      make single WATCHTOWER=0
#
#  NVIDIA-ускорение для depot (ingest): make ingest GPU=1
#      Нужны драйвер и nvidia-container-toolkit; в .env — VIDEO_ACCELERATION=cuda.
# ═══════════════════════════════════════════════════════════════════════

# Режим по умолчанию для ps/logs/down/update. single|cloud|ingest.
MODE ?= single

# GPU=1 → добавить NVIDIA-ускорение для depot (нужен драйвер + nvidia-container-toolkit).
ifeq ($(GPU),1)
  GPU_FILE = -f .deployment/compose/production.ingest.gpu.yml
endif

COMPOSE = docker compose --project-directory . -f .deployment/compose/production.$(MODE).yml $(GPU_FILE)

# WATCHTOWER=0 → не поднимать сервис авто-обновления.
ifeq ($(WATCHTOWER),0)
  UP_FLAGS = --scale watchtower=0
endif

.DEFAULT_GOAL := help
.PHONY: help single cloud ingest up update data logs ps down token

help: ## Показать это меню
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

single: ## Поднять единый узел (redis, mosquitto, frigate, depot, server, telegram)
	$(MAKE) up MODE=single

cloud: ## Поднять cloud-узел (redis, server, telegram, + опц. pwa/email)
	$(MAKE) up MODE=cloud

ingest: ## Поднять ingest-узел (local-redis, mosquitto, frigate, depot×N, forwarder)
	$(MAKE) up MODE=ingest

up: data ## Внутренняя цель: docker compose up -d (без pull — up сам тянет отсутствующее)
	$(COMPOSE) up -d $(UP_FLAGS)

update: data ## Ручное обновление узла: pull свежий :latest, пересоздать, подчистить слои
	$(COMPOSE) pull
	$(COMPOSE) up -d $(UP_FLAGS)
	docker image prune -f

# Docker would create these as root, but the apps write SQLite as uid 1000.
DATA_DIRS = .docker/server .docker/telegram .docker/pwa .docker/email

data:
	@mkdir -p $(DATA_DIRS)
	@chown -R 1000:1000 $(DATA_DIRS) 2>/dev/null || true

# Короткое имя (server) → сервис compose (spotter-server); redis/mosquitto/
# local-redis/watchtower и уже-полные spotter-* имена оставляем как есть.
SVC = $(if $(filter redis mosquitto local-redis watchtower spotter-%,$(s)),$(s),spotter-$(s))

logs: ## Логи одного сервиса: make logs s=server
	$(COMPOSE) logs -f $(SVC)

ps: ## Статус контейнеров узла
	$(COMPOSE) ps

down: ## Остановить узел
	$(COMPOSE) down

token: ## Выпустить код доступа admin (внутри контейнера spotter-server)
	docker exec spotter-server bun spotter sign admin
