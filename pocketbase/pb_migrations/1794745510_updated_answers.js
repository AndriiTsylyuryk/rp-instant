/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3246635500")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_answers_once ON answers (quiz_question, participant)",
      "CREATE        INDEX idx_answers_part ON answers (participant)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3246635500")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
