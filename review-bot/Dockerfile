FROM python:3.12-slim
WORKDIR /app
COPY qscore /app/qscore
COPY review-bot /app/review-bot
RUN pip install --no-cache-dir ./qscore ./review-bot && useradd --system --uid 10001 bot && mkdir /state && chown bot:bot /state
ENV QSCORE_BOT_STATE_PATH=/state/review.sqlite3
ENV QSCORE_BOT_KNOWLEDGE_PATH=/app/review-bot/knowledge/qiskit.json
USER bot
EXPOSE 8080
CMD ["gatesmith-review"]
