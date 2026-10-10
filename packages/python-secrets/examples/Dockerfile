FROM python:3.13-slim

ARG APP_UID=1000
ARG APP_GID=1000
RUN (getent group ${APP_GID} || groupadd --gid ${APP_GID} app) && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home app
COPY packages/python-secrets /tmp/apb-secrets
RUN python -m pip install --no-cache-dir /tmp/apb-secrets && rm -rf /tmp/apb-secrets
WORKDIR /app
COPY packages/python-secrets/examples/app.py /app/app.py
USER app
CMD ["python", "app.py"]
