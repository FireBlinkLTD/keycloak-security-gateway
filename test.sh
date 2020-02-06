#!/bin/bash
set -e

until curl -s http://keycloak:8080 > /dev/null; do
  >&2 echo "Keycloak is unavailable - sleeping"
  sleep 1
done

fbl /app/test/keycloak-config --verbose

yarn test

./node_modules/.bin/nyc report --reporter=text-lcov > /app/report/coverage.lcov
