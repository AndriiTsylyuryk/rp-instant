/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1874489316")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_bank_club   ON question_bank (club, archived_at)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1874489316")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
