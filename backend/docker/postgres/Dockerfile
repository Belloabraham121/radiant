# Radiant — PostgreSQL (Prisma / users, sessions, registry index)
FROM postgres:16-alpine

ENV POSTGRES_USER=radiant \
    POSTGRES_PASSWORD=radiant \
    POSTGRES_DB=radiant

# Optional init scripts (migrations/seeds) go in ./init/
COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 5432
