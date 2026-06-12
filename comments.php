<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

$conn = getDB();
$action = $_GET['action'] ?? '';

switch($action) {
    case 'get_comments':
        $articleId = intval($_GET['article_id'] ?? 0);
        
        if (!$articleId) {
            echo json_encode(['error' => 'Article ID required']);
            exit;
        }
        
        $sql = "SELECT c.*, u.username, u.avatar 
                FROM comments c 
                JOIN users u ON c.user_id = u.id 
                WHERE c.article_id = $articleId 
                ORDER BY c.created_at DESC";
        
        $result = $conn->query($sql);
        $comments = [];
        
        while ($row = $result->fetch_assoc()) {
            $comments[] = $row;
        }
        
        echo json_encode(['comments' => $comments]);
        break;
        
    case 'add_comment':
        $data = json_decode(file_get_contents('php://input'), true);
        
        $articleId = intval($data['article_id'] ?? 0);
        $userId = intval($data['user_id'] ?? 0);
        $content = $conn->real_escape_string($data['content'] ?? '');
        
        if (!$articleId || !$userId || empty($content)) {
            echo json_encode(['error' => 'Article ID, User ID, and content required']);
            exit;
        }
        
        $sql = "INSERT INTO comments (article_id, user_id, content) VALUES ($articleId, $userId, '$content')";
        
        if ($conn->query($sql)) {
            // Get article author for notification
            $article = $conn->query("SELECT user_id, title FROM articles WHERE id = $articleId")->fetch_assoc();
            if ($article && $article['user_id'] != $userId) {
                $conn->query("INSERT INTO notifications (user_id, type, message) VALUES ({$article['user_id']}, 'comment', 'Someone commented on your article: {$article['title']}')");
            }
            
            echo json_encode(['message' => 'Comment added', 'comment_id' => $conn->insert_id]);
        } else {
            echo json_encode(['error' => 'Failed to add comment']);
        }
        break;
        
    case 'delete_comment':
        $id = intval($_GET['id'] ?? 0);
        $userId = intval($_GET['user_id'] ?? 0);
        
        if (!$id || !$userId) {
            echo json_encode(['error' => 'Comment ID and User ID required']);
            exit;
        }
        
        $result = $conn->query("SELECT user_id FROM comments WHERE id = $id");
        $comment = $result->fetch_assoc();
        
        $userResult = $conn->query("SELECT is_admin FROM users WHERE id = $userId");
        $user = $userResult->fetch_assoc();
        
        if ($comment['user_id'] != $userId && $user['is_admin'] != 1) {
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        
        $conn->query("DELETE FROM comments WHERE id = $id");
        echo json_encode(['message' => 'Comment deleted']);
        break;
        
    default:
        echo json_encode(['error' => 'Invalid action']);
}

$conn->close();
?>