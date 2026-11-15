/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_879072730")

  // add field
  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "select4280494897",
    "maxSelect": 0,
    "name": "games",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "et",
      "en"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_879072730")

  // remove field
  collection.fields.removeById("select4280494897")

  return app.save(collection)
})
