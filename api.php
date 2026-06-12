<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

$conn = getDB();
$action = $_GET['action'] ?? '';

// Helper function to get user info
function getUserById($conn, $id) {
    $result = $conn->query("SELECT username, avatar FROM users WHERE id = $id");
    return $result->num_rows > 0 ? $result->fetch_assoc() : ['username' => 'Unknown', 'avatar' => ''];
}

switch($action) {
    case 'get_articles':
        $status = $_GET['status'] ?? 'approved';
        $category = $_GET['category'] ?? '';
        $userId = $_GET['user_id'] ?? 0;
        
        $where = "WHERE a.status = '$status'";
        if (!empty($category)) {
            $where .= " AND a.category = '$category'";
        }
        if ($userId > 0) {
            $where = "WHERE a.user_id = $userId";
        }
        
        $sql = "SELECT a.*, u.username, u.avatar 
                FROM articles a 
                JOIN users u ON a.user_id = u.id 
                $where 
                ORDER BY a.created_at DESC";
        
        $result = $conn->query($sql);
        $articles = [];
        
        while ($row = $result->fetch_assoc()) {
            $articles[] = $row;
        }
        
        echo json_encode(['articles' => $articles]);
        break;
        
    case 'get_article':
        $id = $_GET['id'] ?? 0;
        
        if (!$id) {
            echo json_encode(['error' => 'No article ID provided']);
            exit;
        }
        
        $sql = "SELECT a.*, u.username, u.avatar 
                FROM articles a 
                JOIN users u ON a.user_id = u.id 
                WHERE a.id = $id";
        
        $result = $conn->query($sql);
        
        if ($result->num_rows == 0) {
            echo json_encode(['error' => 'Article not found']);
            exit;
        }
        
        // Increment views
        $conn->query("UPDATE articles SET views = views + 1 WHERE id = $id");
        
        echo json_encode(['article' => $result->fetch_assoc()]);
        break;
        
    case 'create_article':
        $data = json_decode(file_get_contents('php://input'), true);
        
        $userId = intval($data['user_id'] ?? 0);
        $title = $conn->real_escape_string($data['title'] ?? '');
        $content = $conn->real_escape_string($data['content'] ?? '');
        $category = $conn->real_escape_string($data['category'] ?? 'general');
        $tags = $conn->real_escape_string($data['tags'] ?? '[]');
        $image = $conn->real_escape_string($data['image'] ?? '');
        
        if (!$userId || empty($title) || empty($content)) {
            echo json_encode(['error' => 'Title, content, and user ID required']);
            exit;
        }
        
        $sql = "INSERT INTO articles (user_id, title, content, category, tags, image, status) 
                VALUES ($userId, '$title', '$content', '$category', '$tags', '$image', 'pending')";
        
        if ($conn->query($sql)) {
            echo json_encode(['message' => 'Article submitted for review', 'article_id' => $conn->insert_id]);
        } else {
            echo json_encode(['error' => 'Failed to create article']);
        }
        break;
        
    case 'update_article':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['id'] ?? 0);
        $userId = intval($data['user_id'] ?? 0);
        
        if (!$id || !$userId) {
            echo json_encode(['error' => 'Article ID and User ID required']);
            exit;
        }
        
        // Check ownership or admin
        $result = $conn->query("SELECT user_id FROM articles WHERE id = $id");
        $article = $result->fetch_assoc();
        
        $userResult = $conn->query("SELECT is_admin FROM users WHERE id = $userId");
        $user = $userResult->fetch_assoc();
        
        if ($article['user_id'] != $userId && $user['is_admin'] != 1) {
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        
        $title = $conn->real_escape_string($data['title'] ?? '');
        $content = $conn->real_escape_string($data['content'] ?? '');
        $category = $conn->real_escape_string($data['category'] ?? '');
        $tags = $conn->real_escape_string($data['tags'] ?? '');
        $image = $conn->real_escape_string($data['image'] ?? '');
        $status = $conn->real_escape_string($data['status'] ?? '');
        
        $updates = [];
        if (!empty($title)) $updates[] = "title = '$title'";
        if (!empty($content)) $updates[] = "content = '$content'";
        if (!empty($category)) $updates[] = "category = '$category'";
        if (!empty($tags)) $updates[] = "tags = '$tags'";
        if (!empty($image)) $updates[] = "image = '$image'";
        if (!empty($status) && $user['is_admin'] == 1) $updates[] = "status = '$status'";
        
        if (count($updates) > 0) {
            $sql = "UPDATE articles SET " . implode(', ', $updates) . " WHERE id = $id";
            $conn->query($sql);
        }
        
        echo json_encode(['message' => 'Article updated']);
        break;
        
    case 'delete_article':
        $id = intval($_GET['id'] ?? 0);
        $userId = intval($_GET['user_id'] ?? 0);
        
        if (!$id || !$userId) {
            echo json_encode(['error' => 'Article ID and User ID required']);
            exit;
        }
        
        $result = $conn->query("SELECT user_id FROM articles WHERE id = $id");
        $article = $result->fetch_assoc();
        
        $userResult = $conn->query("SELECT is_admin FROM users WHERE id = $userId");
        $user = $userResult->fetch_assoc();
        
        if ($article['user_id'] != $userId && $user['is_admin'] != 1) {
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        
        $conn->query("DELETE FROM comments WHERE article_id = $id");
        $conn->query("DELETE FROM articles WHERE id = $id");
        
        echo json_encode(['message' => 'Article deleted']);
        break;
        
    case 'like_article':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = intval($data['article_id'] ?? 0);
        $userId = intval($data['user_id'] ?? 0);
        
        if (!$id || !$userId) {
            echo json_encode(['error' => 'Article ID and User ID required']);
            exit;
        }
        
        $result = $conn->query("SELECT likes FROM articles WHERE id = $id");
        $article = $result->fetch_assoc();
        
        $likes = json_decode($article['likes'] ?? '[]', true);
        $liked = false;
        
        $key = array_search($userId, $likes);
        if ($key !== false) {
            unset($likes[$key]);
            $likes = array_values($likes);
        } else {
            $likes[] = $userId;
            $liked = true;
            
            // Notify article author
            $articleData = $conn->query("SELECT user_id, title FROM articles WHERE id = $id")->fetch_assoc();
            if ($articleData && $articleData['user_id'] != $userId) {
                $conn->query("INSERT INTO notifications (user_id, type, message) VALUES ({$articleData['user_id']}, 'like', 'Someone liked your article: {$articleData['title']}')");
            }
        }
        
        $likesJson = json_encode($likes);
        $conn->query("UPDATE articles SET likes = '$likesJson' WHERE id = $id");
        
        echo json_encode(['success' => true, 'liked' => $liked, 'likes_count' => count($likes)]);
        break;
        
    case 'get_stats':
        $users = $conn->query("SELECT COUNT(*) as count FROM users")->fetch_assoc()['count'];
        $articles = $conn->query("SELECT COUNT(*) as count FROM articles WHERE status = 'approved'")->fetch_assoc()['count'];
        $pending = $conn->query("SELECT COUNT(*) as count FROM articles WHERE status = 'pending'")->fetch_assoc()['count'];
        
        echo json_encode([
            'users' => $users,
            'articles' => $articles,
            'pending' => $pending
        ]);
        break;
        
    case 'get_users':
        $result = $conn->query("SELECT id, username, bio, avatar, is_admin, followers, following FROM users ORDER BY created_at DESC");
        $users = [];
        while ($row = $result->fetch_assoc()) {
            $users[] = $row;
        }
        echo json_encode(['users' => $users]);
        break;
        
    case 'follow_user':
        $data = json_decode(file_get_contents('php://input'), true);
        $targetUserId = intval($data['user_id'] ?? 0);
        $currentUserId = intval($data['current_user_id'] ?? 0);
        
        if (!$targetUserId || !$currentUserId) {
            echo json_encode(['error' => 'User IDs required']);
            exit;
        }
        
        $currentUser = $conn->query("SELECT following FROM users WHERE id = $currentUserId")->fetch_assoc();
        $following = json_decode($currentUser['following'] ?? '[]', true);
        
        $key = array_search($targetUserId, $following);
        if ($key !== false) {
            unset($following[$key]);
            $following = array_values($following);
        } else {
            $following[] = $targetUserId;
        }
        
        $conn->query("UPDATE users SET following = '" . json_encode($following) . "' WHERE id = $currentUserId");
        
        $targetUser = $conn->query("SELECT followers FROM users WHERE id = $targetUserId")->fetch_assoc();
        $followers = json_decode($targetUser['followers'] ?? '[]', true);
        
        $key = array_search($currentUserId, $followers);
        if ($key !== false) {
            unset($followers[$key]);
            $followers = array_values($followers);
        } else {
            $followers[] = $currentUserId;
        }
        
        $conn->query("UPDATE users SET followers = '" . json_encode($followers) . "' WHERE id = $targetUserId");
        
        echo json_encode(['success' => true]);
        break;
        
    default:
        echo json_encode(['error' => 'Invalid action']);
}

$conn->close();
?>