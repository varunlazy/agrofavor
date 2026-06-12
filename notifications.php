<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once 'config.php';

$conn = getDB();
$action = $_GET['action'] ?? '';

switch($action) {
    case 'get_notifications':
        $userId = intval($_GET['user_id'] ?? 0);
        
        if (!$userId) {
            echo json_encode(['error' => 'User ID required']);
            exit;
        }
        
        $result = $conn->query("SELECT * FROM notifications WHERE user_id = $userId ORDER BY created_at DESC LIMIT 50");
        $notifications = [];
        
        while ($row = $result->fetch_assoc()) {
            $notifications[] = $row;
        }
        
        echo json_encode(['notifications' => $notifications]);
        break;
        
    case 'mark_read':
        $id = intval($_GET['id'] ?? 0);
        
        if (!$id) {
            echo json_encode(['error' => 'Notification ID required']);
            exit;
        }
        
        $conn->query("UPDATE notifications SET read_status = 1 WHERE id = $id");
        echo json_encode(['success' => true]);
        break;
        
    default:
        echo json_encode(['error' => 'Invalid action']);
}

$conn->close();
?>