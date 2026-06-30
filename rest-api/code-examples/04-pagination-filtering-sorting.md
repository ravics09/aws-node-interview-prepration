# Example 4 — Pagination, Filtering & Sorting

[← Back to index](./README.md)

Both **offset** (simple) and **cursor/keyset** (scalable) pagination, plus safe filtering and sorting via query params.

## Offset pagination (simple — fine for small/stable datasets)

```js
router.get('/v1/items', wrap(async (req, res) => {
  const page = Math.max(+req.query.page || 1, 1);
  const limit = Math.min(+req.query.limit || 20, 100);   // cap to protect the DB
  const offset = (page - 1) * limit;

  const [data, total] = await Promise.all([
    repo.find({ limit, offset }),
    repo.count(),
  ]);

  res.json({
    data,
    page: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));
```
> Downside: large `OFFSET` is slow, and inserts/deletes between page reads can skip or duplicate rows.

## Cursor / keyset pagination (stable & scalable)

```js
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const dec = (c) => JSON.parse(Buffer.from(c, 'base64url').toString());

router.get('/v1/items', wrap(async (req, res) => {
  const limit = Math.min(+req.query.limit || 20, 100);
  const cursor = req.query.cursor ? dec(req.query.cursor) : null;

  // keyset: fetch rows after the last seen (id) — uses an index, no large OFFSET
  const rows = await repo.find({
    where: cursor ? { id: { gt: cursor.id } } : {},
    orderBy: { id: 'asc' },
    limit: limit + 1,             // fetch one extra to detect "hasMore"
  });

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  const nextCursor = hasMore ? enc({ id: data.at(-1).id }) : null;

  res.json({
    data,
    page: { limit, hasMore },
    links: { next: nextCursor ? `/v1/items?limit=${limit}&cursor=${nextCursor}` : null },
  });
}));
```

## Safe filtering & sorting (whitelist to prevent injection/abuse)

```js
const ALLOWED_FILTERS = ['status', 'category'];
const ALLOWED_SORTS = ['createdAt', 'price', 'name'];

function buildQuery(query) {
  // filtering: only allow known fields
  const filters = {};
  for (const key of ALLOWED_FILTERS) if (query[key] !== undefined) filters[key] = query[key];

  // sorting: "-createdAt" = desc, "price" = asc; reject unknown fields
  let orderBy = { createdAt: 'desc' };
  if (query.sort) {
    const desc = query.sort.startsWith('-');
    const field = desc ? query.sort.slice(1) : query.sort;
    if (ALLOWED_SORTS.includes(field)) orderBy = { [field]: desc ? 'desc' : 'asc' };
  }
  return { filters, orderBy };
}

// GET /v1/items?status=active&category=books&sort=-price&limit=20
```

## DynamoDB cursor pagination (uses LastEvaluatedKey)

```js
router.get('/v1/ddb-items', wrap(async (req, res) => {
  const limit = Math.min(+req.query.limit || 20, 100);
  const ExclusiveStartKey = req.query.cursor ? dec(req.query.cursor) : undefined;

  const out = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'ITEM' },
    Limit: limit,
    ExclusiveStartKey,
  }));

  res.json({
    data: out.Items,
    links: { next: out.LastEvaluatedKey ? `/v1/ddb-items?cursor=${enc(out.LastEvaluatedKey)}` : null },
  });
}));
```

## Lead-level notes
- **Cap `limit`** (e.g., 100) so a client can't request a million rows and exhaust the DB/memory.
- **Cursor/keyset > offset** for large or fast-changing collections (stable, index-friendly, no deep-OFFSET cost).
- **Whitelist** filter/sort fields — never interpolate raw query params into a query (injection + accidental full scans).
- DynamoDB pagination is naturally cursor-based via **`LastEvaluatedKey`** (opaque token).
