FROM python:3.11-slim

WORKDIR /app

COPY monitor.py /app

RUN pip install pymongo

CMD ["python", "monitor.py"]
