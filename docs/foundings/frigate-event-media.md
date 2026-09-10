# Frigate: снимок и клип события

Проверено по исходникам Frigate 0.17 (`frigate/track/object_processing.py`), не по документации.

## Флаги в `end` окончательны

Обработчик `end` пишет файл на диск **до** публикации события в MQTT, синхронно, в одном потоке:

```python
def end(camera, obj, frame_name):
    obj.has_snapshot = self.should_save_snapshot(camera, obj)
    obj.has_clip = self.should_retain_recording(camera, obj)
    if obj.has_snapshot or obj.has_clip:
        obj.write_thumbnail_to_disk()
    if obj.has_snapshot:
        obj.write_snapshot_to_disk()          # файл записан здесь
    if not obj.false_positive:
        self.dispatcher.publish("events", ...)  # и только потом MQTT
```

Отсюда: `has_snapshot: true` в `end` означает, что файл уже лежит на диске — гонки нет, ретраи по времени не нужны. `has_snapshot: false` означает, что файла не будет никогда — ждать бессмысленно.

Раньше мы запрашивали снимок вслепую, а первый 404 считали окончательным приговором. Ошибочны были обе половины.

## `position_changes == 0` — ни снимка, ни клипа

`should_save_snapshot` и `should_retain_recording` содержат одинаковую проверку:

```python
if obj.obj_data["position_changes"] == 0:
    return False
```

Событие с неподвижным объектом не получит ни снимка, ни клипа, поэтому дойти до получателя может только пустым. Отсюда фильтр `SKIP_MOTIONLESS_EVENTS` в адаптере — и он должен работать на **всех** стадиях: пропущенный `start` без `end` оставил бы жизненный цикл незакрытым.

Исторически фильтр был сужен до `update` ради борьбы с дублями сообщений (коммит `b852ae0`) — это лечило симптом не там и открыло дорогу пустым уведомлениям.

## MQTT-снимки — отдельный механизм

`frigate/<камера>/<метка>/snapshot` (JPEG ~12 КБ, `retain: true`) публикуется через `should_mqtt_snapshot`, а не через файлы на диске. Использовать его для привязки к событию нельзя: **в топике нет `event_id`**, а `retain` означает, что при переподключении сразу прилетит старый снимок.

Отключается `cameras.<камера>.mqtt.enabled: false`. Это не трогает `frigate/events` — глобальный `mqtt.enabled` (`app.py`) отдельный параметр.
