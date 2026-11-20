/// <reference path="../pb_data/types.d.ts" />
/**
 * games.screen_token: непередбачуваний токен для екрана арени (/screen/:token).
 * Екран більше не відкривається за коротким кодом приєднання, який легко перебрати.
 *
 *  - нові ігри: PB сам генерує 24 символи [A-Za-z0-9] (autogeneratePattern);
 *  - наявні ігри: заповнюємо нижче одноразово;
 *  - правила колекції games = null, тож токен читає лише API під superuser.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("games")

  collection.fields.add(new Field({
    "autogeneratePattern": "[A-Za-z0-9]{24}",
    "help": "",
    "hidden": false,
    "id": "text3002000001",
    "max": 24,
    "min": 24,
    "name": "screen_token",
    "pattern": "^[A-Za-z0-9]{24}$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.addIndex("idx_games_screen_token", true, "screen_token", "screen_token != ''")
  app.save(collection)

  // Backfill: у вже створених ігор токена ще немає.
  for (const game of app.findAllRecords("games")) {
    if (!game.getString("screen_token")) {
      game.set("screen_token", $security.randomString(24))
      app.saveNoValidate(game)
    }
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("games")
  collection.removeIndex("idx_games_screen_token")
  collection.fields.removeByName("screen_token")
  return app.save(collection)
})
