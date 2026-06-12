<?php
// ==============================================
// GREENPEDIA - Database Configuration
// ==============================================

// Database credentials
define('DB_HOST', 'sql303.infinityfree.com');
define('DB_USER', 'if0_36960050');
define('DB_PASS', '1oWeXqfam0X');
define('DB_NAME', 'if0_36960050_greenpedia');

// Get database connection
function getDB() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($conn->connect_error) {
        die(json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]));
    }
    return $conn;
}

// Initialize all tables
function initTables() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS);
    
    // Create database if not exists
    $conn->query("CREATE DATABASE IF NOT EXISTS " . DB_NAME);
    $conn->close();
    
    // Now connect to the database
    $conn = getDB();
    
    // ==============================================
    // USERS TABLE
    // ==============================================
    $sql = "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        bio TEXT DEFAULT '',
        avatar VARCHAR(255) DEFAULT '',
        is_admin INT DEFAULT 0,
        followers TEXT DEFAULT '[]',
        following TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    $conn->query($sql);
    
    // ==============================================
    // ARTICLES TABLE
    // ==============================================
    $sql = "CREATE TABLE IF NOT EXISTS articles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        image VARCHAR(255) DEFAULT '',
        likes TEXT DEFAULT '[]',
        views INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )";
    $conn->query($sql);
    
    // ==============================================
    // COMMENTS TABLE
    // ==============================================
    $sql = "CREATE TABLE IF NOT EXISTS comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        article_id INT NOT NULL,
        user_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )";
    $conn->query($sql);
    
    // ==============================================
    // NOTIFICATIONS TABLE
    // ==============================================
    $sql = "CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        read_status INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )";
    $conn->query($sql);
    
    // ==============================================
    // CREATE ADMIN USER (if not exists)
    // ==============================================
    $result = $conn->query("SELECT id FROM users WHERE username = 'admin'");
    if ($result->num_rows == 0) {
        $hash = password_hash('admin123', PASSWORD_DEFAULT);
        $conn->query("INSERT INTO users (username, email, password, bio, avatar, is_admin) 
                      VALUES ('admin', 'admin@greenpedia.com', '$hash', 'Site Administrator', '', 1)");
    }
    
    $conn->close();
    return true;
}

// Initialize on include
initTables();
?>
