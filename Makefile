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
# ═══════════════════════════════════════════════════════════════════════

# Режим по умолчанию для ps/logs/down/update. single|cloud|ingest.
MODE ?= single

COMPOSE = docker compose --project-directory . -f .deployment/compose/production.$(MODE).yml

# WATCHTOWER=0 → не поднимать сервис авто-обновления.
ifeq ($(WATCHTOWER),0)
  UP_FLAGS = --scale watchtower=0
endif

.DEFAULT_GOAL := help
.PHONY: help single cloud ingest up update logs ps down token

help: ## Показать это меню
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

single: ## Поднять единый узел (redis, mosquitto, frigate, depot, server, telegram)
	$(MAKE) up MODE=single

cloud: ## Поднять cloud-узел (redis, server, telegram, + опц. pwa/email)
	$(MAKE) up MODE=cloud

ingest: ## Поднять ingest-узел (local-redis, mosquitto, frigate, depot×N, forwarder)
	$(MAKE) up MODE=ingest

up: ## Внутренняя цель: docker compose up -d (без pull — up сам тянет отсутствующее)
	$(COMPOSE) up -d $(UP_FLAGS)

update: ## Ручное обновление узла: pull свежий :latest, пересоздать, подчистить слои
	$(COMPOSE) pull
	$(COMPOSE) up -d $(UP_FLAGS)
	docker image prune -f

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
	docker exec spotter-server ./spotter sign admin
