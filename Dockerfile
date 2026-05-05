FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y wget && \
    mkdir -p /app/data && \
    wget -O /app/data/GeoLite2-City.mmdb "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb" && \
    apt-get remove -y wget && apt-get autoremove -y && apt-get clean
COPY . .
EXPOSE 8000
CMD ["gunicorn", "chatPsych:app", "-w", "4", "-b", "0.0.0.0:8000"]