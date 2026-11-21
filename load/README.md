# Load test: 2000 players

Сценарій:

1. 2000 VU заходять у гру через `POST /api/join` (join-и розтягнуті на 60 с).
2. Сидять у лоббі до `starts_at`.
3. На кожне з 20 питань відповідають один раз.
4. Відповіді стартують через 2 с після відкриття питання і йдуть зі швидкістю 600 POST/s.
5. Після відповіді VU чекає наступне питання, доки не закінчаться всі 20.

При 2000 VU і 600 POST/s остання відповідь на питання йде приблизно на 5.4 с
після відкриття (питання відкрите 10 с). Якщо потрібно строго вкластися в
2–4 с, використовуйте `ANSWER_RPS=1000` — тоді буде ~1000 відповідей/с.

## Що потрібно

- Docker Desktop з PocketBase
- API на `http://127.0.0.1:3000`
- k6 у PATH. У цій машині він є тут:
  `C:\Program Files\k6\k6.exe`

## Запуск

Відкрийте два термінали в корені репозиторію.

Термінал 1 — PocketBase:

```powershell
npm run pb:up
```

Термінал 2 — API:

```powershell
npm run dev:api
```

Перевірка API:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Далі в будь-якому терміналі з кореня репозиторію створіть нову гру:

```powershell
npm run seed:load
```

Seeder створює нову гру, 20 питань і файл `load/game.js`. За замовчуванням
гра стартує через 120 с. Після цього одразу запускайте k6:

```powershell
k6 run load/match.js
```

Якщо `k6` не знаходиться в PATH:

```powershell
& "C:\Program Files\k6\k6.exe" run load/match.js
```

Не запускайте k6 через 1–2 хвилини після seeder: VU можуть не встигнути
зайти в лоббі до старту. Якщо потрібно більше часу, збільште lead:

```powershell
$env:LOAD_LEAD_SECONDS=180
npm run seed:load
k6 run load/match.js
```

## Тест `/api/play/state`: 2000 гравців

`load/state.js` перевіряє саме поллінг стану, а не відповіді. Кожен VU:

1. Один раз робить `POST /api/join` і отримує власну cookie-сесію.
2. Далі кожну секунду робить `GET /api/play/state`.
3. Має власний cookie jar k6; `noCookiesReset: true` не дає k6 очистити
   cookie після кожної ітерації.

Запуск на 2000 VU:

```powershell
$env:LOAD_LEAD_SECONDS=30
npm run seed:load
$env:VUS=2000
$env:STATE_INTERVAL_MS=1000
$env:STATE_JITTER_MS=200
$env:DURATION=120s
& "C:\Program Files\k6\k6.exe" run load/state.js
```

`STATE_INTERVAL_MS=1000` означає одну спробу запиту на секунду на VU, тобто
ціль ~2000 RPS. Якщо латентність запиту більша за 1 с, фактичний RPS буде нижчим.
`STATE_JITTER_MS=0` дає синхронний пік (найгірший для сервера), `200` —
реалістичніший розкид.

Для перевірки нових TCP/TLS-з'єднань (а не keep-alive) запускайте окремий
прогін з `--no-connection-reuse`; це набагато важче для nginx. Звичайний
браузерний поллінг використовує keep-alive, тому основний тест має бути без
цього прапорця.

## Налаштування

Усі параметри задаються через env-змінні PowerShell:

```powershell
$env:VUS=2000
$env:JOIN_SPREAD_MS=60000
$env:ANSWER_START_MS=2000
$env:ANSWER_RPS=600
$env:ANSWER_JITTER_MS=100
$env:LOAD_QUESTIONS=20
$env:LOAD_LEAD_SECONDS=120
npm run seed:load
k6 run load/match.js
```

Основні параметри:

| Змінна | За замовчуванням | Значення |
| --- | ---: | --- |
| `VUS` | `2000` | кількість віртуальних гравців |
| `JOIN_SPREAD_MS` | `60000` | за скільки мс розтягнути 2000 join-ів |
| `ANSWER_START_MS` | `2000` | пауза після відкриття питання перед першою відповіддю |
| `ANSWER_RPS` | `600` | цільова швидкість `POST /api/play/answer` |
| `ANSWER_JITTER_MS` | `100` | випадковий розкид часу відповіді |
| `LOAD_QUESTIONS` | `20` | кількість питань у новій грі |
| `LOAD_LEAD_SECONDS` | `120` | скільки секунд від seeder до старту гри |
| `LOAD_CODE` | випадковий | явний join-код нової гри |
| `BASE_URL` | `http://127.0.0.1:3000` | адреса API |
| `RESULTS_FILE` | `load/results.json` | куди k6 збереже повний summary |

Важливо: 2000 відповідей за 600/с фізично займають ~3.33 с. Тому одночасно
"600/с" і "всі відповіді за перші 2–4 с" неможливо. Для вікна 2–4 с ставте
`ANSWER_RPS=1000`.

## Що саме пише в базу

Кожен успішний `POST /api/play/answer` робить `INSERT` у `answers` — це і є
цільові 600 записів/с. Для правильної відповіді додатково йде
`UPDATE participants.score`. У seeder правильна відповідь чергується
(0,1,2,3), а VU обирає option як `(__VU + questionIndex) % 4`, тому
приблизно 25% відповідей правильні. Отже фактично буде приблизно:

- ~600 `INSERT` у `answers` за секунду;
- ~150 `UPDATE` у `participants` за секунду;
- разом ~750 операцій запису за секунду.

## Результати

k6 друкує короткий summary у консоль і пише повний звіт у
`load/results.json`.

Ключові метрики:

- `joins_ok` — скільки join-ів пройшло;
- `answers_ok` — скільки відповідей прийнято;
- `answer_missed` — скільки відповідей VU пропустив, бо не встиг до закриття;
- `join_success` / `answer_success` — частка успішних запитів;
- `join_latency` / `answer_latency` — затримки;
- `http_req_failed` — частка HTTP-помилок.

Пороги тесту:

- `join_success > 99%`
- `answer_success > 99%`
- `answer_missed == 0`
- `http_req_failed < 2%`
- `join_latency p95 < 5 с`
- `answer_latency p95 < 3 с`, `p99 < 5 с`

Якщо з'явиться `HeadersTimeoutError` від PocketBase або p95 різко виросте —
це означає, що база/API вже не тримають навантаження.

## Часті помилки

- `Only Xs until game start...` — k6 запущено занадто пізно. Запустіть
  `npm run seed:load` знову і одразу після нього k6.
- `k6 : The term 'k6' is not recognized` — використайте повний шлях
  `C:\Program Files\k6\k6.exe` або перезапустіть термінал після оновлення PATH.
- `401 no_session` — join не пройшов або cookie не зберігся; дивіться
  `join_success` і логи API.
- `409 already_answered` — використовується стара гра; запустіть seeder
  ще раз, щоб створити новий join-код.
- `404 not_found` — API не бачить гру/питання; перевірте, що API
  перезапущено після змін і що seeder завершився без помилок.
