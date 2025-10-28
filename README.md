# Spotter

## Services

## Technician stack

Database: MongoDB \
ORM: Prisma JS \
Message Broker: Kafka | Mosquitto \
Broker Client: Kafka JS | Mqtt


## TODO

- [ ] Replace mongodb with scylladb
    Replace prisma with native cassandra-driver
- [ ] Add redis-caching for users, chats and events
- [ ] Integrate lgtm-stack


## Generate new token using cli

### 1. Admin
```bash
cd apps/bot
bun src/cli.ts sign admin
```
