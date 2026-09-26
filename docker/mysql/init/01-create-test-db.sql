CREATE DATABASE IF NOT EXISTS campus_coin_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON campus_coin_test.* TO 'campus'@'%';
FLUSH PRIVILEGES;
