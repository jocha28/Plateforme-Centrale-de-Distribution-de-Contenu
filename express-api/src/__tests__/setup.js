/**
 * Configuration globale des tests Jest.
 * Utilise une base de données SQLite en mémoire isolée pour chaque suite.
 */

process.env.NODE_ENV      = 'test';
process.env.JWT_SECRET    = 'secret_test_jest_plateforme_2024';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ADMIN_USERNAME = 'admin_test';
process.env.ADMIN_PASSWORD = 'motdepasse_test_123';
process.env.PORT           = '3001';
process.env.DB_PATH        = ':memory:';
process.env.FASTAPI_URL    = 'http://localhost:8000';
