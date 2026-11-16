# Real-PostgreSQL tests

```bash
node db-tests/pg/start.mjs <file>          # disposable local PostgreSQL on 127.0.0.1 (embedded-postgres, installed in db-tests/pg only)
# create an EMPTY database whose name contains "test", then:
TEST_DATABASE_URL='postgresql://user:pass@127.0.0.1:PORT/tgfm_test_x' npm run test:db
```
`scripts/db-test.mjs` refuses anything that is not a local, empty, test-named database, never reads DATABASE_URL, checks that the server
it reached really is 127.0.0.1, applies the migrations only to that empty database, then runs `db-tests/*.test.mjs`.

Covered: limiter atomicity under 200 concurrent requests and its fixed-window behaviour, unique-key races (webhook event keys, registration,
order numbers, bag rows), `SELECT ... FOR UPDATE` serialisation (no lost updates), rollback of multi-table transactions, persistence across
connections, foreign keys and cascades, ownership-scoped deletes, SERIALIZABLE admin-bootstrap protection.
`db-tests/reset-and-seed.mjs` loads the QA fixtures into a local test database so the route QA scripts can run against real PostgreSQL.
