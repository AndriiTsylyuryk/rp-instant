/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2874626212")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX idx_qq_source   ON quiz_questions (source)"
    ]
  }, collection)

  // update field
  collection.fields.addAt(9, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1874489316",
    "help": "",
    "hidden": false,
    "id": "relation357068066",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "source",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2874626212")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  // update field
  collection.fields.addAt(9, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1874489316",
    "help": "",
    "hidden": false,
    "id": "relation357068066",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "sourse",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
