#!/usr/bin/env bash
# লোকাল সিকিউরিটি/ফাংশনাল টেস্ট (Node 22+ লাগবে; কোনো npm প্যাকেজ বা নেটওয়ার্ক লাগে না; আসল D1-এ কিছু ছোঁয় না)
set -e
cd "$(dirname "$0")"
rm -rf build && mkdir build && cp -r ../functions build/functions && echo '{"type":"module"}' > build/package.json
cp ../migrations/009_multi_vendor.sql fixtures/m009.sql
cp ../schema.sql fixtures/new_schema.sql
for t in t1_migration t2_api t3_compat t4_stock t5_delete; do node --no-warnings $t.mjs; done
rm -rf build
