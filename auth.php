<?php
// ==============================================
// GREENPEDIA - Authentication API
// ==============================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

$conn = getDB();

$action = $_GET['action'] ?? '';

switch($action) {
    case 'register':
        $data = json_decode(file_get_contents('php://input'), true);
        
        $username = $conn->real_escape_string($data['username'] ?? '');
        $email = $conn->real_escape_string($data['email'] ?? '');
        $password = $data['password'] ?? '';
        
        if (empty($username) || empty($email) || empty($password)) {
            echo json_encode(['error' => 'All fields required']);
            exit;
        }
        
        // Check if user exists
        $result = $conn->query("SELECT id FROM users WHERE username = '$username' OR email = '$email'");
        if ($result->num_rows > 0) {
            echo json_encode(['error' => 'User already exists']);
            exit;
        }
        
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $avatar = 'https://api.dicebear.com/7.x/initials/svg?seed=' . urlencode($username);
        
        $sql = "INSERT INTO users (username, email, password, bio, avatar) VALUES ('$username', '$email', '$passwordHash', '', '$avatar')";
        
        if ($conn->query($sql)) {
            echo json_encode(['message' => 'User created', 'user_id' => $conn->insert_id]);
        } else {
            echo json_encode(['error' => 'Failed to create user']);
        }
        break;
        
    case 'login':
        $data = json_decode(file_get_contents('php://input'), true);
        
        $username = $conn->real_escape_string($data['username'] ?? '');
        $password = $data['password'] ?? '';
        
        if (empty($username) || empty($password)) {
            echo json_encode(['error' => 'All fields required']);
            exit;
        }
        
        $result = $conn->query("SELECT * FROM users WHERE username = '$username'");
        
        if ($result->num_rows == 0) {
            echo json_encode(['error' => 'Invalid credentials']);
            exit;
        }
        
        $user = $result->fetch_assoc();
        
        if (!password_verify($password, $user['password'])) {
            echo json_encode(['error' => 'Invalid credentials']);
            exit;
        }
        
        echo json_encode([
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'email' => $user['email'],
                'bio' => $user['bio'],
                'avatar' => $user['avatar'],
                'is_admin' => $user['is_admin'],
                'followers' => $user['followers'],
                'following' => $user['following']
            ]
        ]);
        break;
        
    case 'me':
        $userId = intval($_GET['user_id'] ?? 0);
        
        if (!$userId) {
            echo json_encode(['error' => 'No user ID provided']);
            exit;
        }
        
        $result = $conn->query("SELECT id, username, email, bio, avatar, is_admin, followers, following, created_at FROM users WHERE id = $userId");
        
        if ($result->num_rows == 0) {
            echo json_encode(['error' => 'User not found']);
            exit;
        }
        
        echo json_encode(['user' => $result->fetch_assoc()]);
        break;
        
    case 'logout':
        echo json_encode(['message' => 'Logged out']);
        break;
        
    default:
        echo json_encode(['error' => 'Invalid action']);
}

$conn->close();
?>