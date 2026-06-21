from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET: str
    JWT_EXPIRE_MINUTES: int = 10080
    INSTANCE_ID: str = "chat-service"
    AUTH_SERVICE_URL: str = "http://auth-service:8000"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
