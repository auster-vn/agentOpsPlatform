FROM bitnamilegacy/spark:3.5.1

USER root
RUN pip install --no-cache-dir \
    psycopg2-binary==2.9.9 \
    boto3==1.34.69 \
    kafka-python==2.0.2

USER 1001
WORKDIR /opt/spark-apps
