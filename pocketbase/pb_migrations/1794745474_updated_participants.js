/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_653341844")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_participants_token ON participants (session_token)",
      "CREATE UNIQUE INDEX idx_participants_nickname ON participants (game, nickname)",
      "CREATE        INDEX idx_participants_board    ON participants (game, score DESC)",
      "CREATE UNIQUE INDEX idx_participants_game_fan ON participants (game, fan) WHERE fan != ''"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_653341844")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
