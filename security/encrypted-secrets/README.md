# Encrypted Secrets
Secrets for version 4.2.11 are encrypted using AES-256-CBC.
Key location (local): /home/javier28/.local/share/freejt7-secrets/release-backup.key
To decrypt:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 210000 -pass file:/home/javier28/.local/share/freejt7-secrets/release-backup.key -in freejt7-secrets-4.2.11.tar.enc -out decrypted_secrets.tar
