"""Place the loader before imports that read application settings."""
from apb_secrets import load_env

load_env(["DATABASE_URL", "SERVICE_API_KEY"])

# Your existing application starts here. Never log the secret values.
print("Application configuration loaded.")
