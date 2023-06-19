import Loki from 'lokijs'

export const initCollections = (
  loki: Loki,
) => {
  [ 'users', 'events' ].forEach((code) => {
    if (!loki.getCollection(code)) {
      loki.addCollection(code)
    }
  })
}
