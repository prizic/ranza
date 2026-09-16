# Plain PostgreSQL plus pgTAP, which the official image does not ship.
# Needed only to run the database suites in tests/database.
FROM postgres:17

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-pgtap \
  && rm -rf /var/lib/apt/lists/*
