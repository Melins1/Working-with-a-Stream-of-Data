import time
from pymongo import MongoClient
from datetime import datetime

DB_HOST = "dbstorage"
DB_NAME = "cloneDetector"
INTERVAL = 10  # seconds

# Connect to MongoDB
client = MongoClient(f"mongodb://{DB_HOST}:27017/")
db = client[DB_NAME]

# Skip old status updates at startup
last_update_count = db["statusUpdates"].count_documents({})
print(f"[{datetime.now().isoformat()}] Monitor started. Skipping {last_update_count} old status updates.")

def get_counts():
    """Return document counts for key collections."""
    counts = {}
    for coll in ["files", "chunks", "candidates", "clones"]:
        counts[coll] = db[coll].count_documents({})
    return counts

def get_new_status_updates():
    """Return new status updates since last check."""
    global last_update_count
    total_updates = db["statusUpdates"].count_documents({})
    if total_updates > last_update_count:
        updates = list(db["statusUpdates"].find().skip(last_update_count))
        last_update_count = total_updates
        return updates
    return []

def average_clone_size():
    """Compute the average clone size in lines of code across all instances of all clones."""
    clones = list(db["clones"].find({}))
    total_lines = 0
    total_instances = 0
    for clone in clones:
        instances = clone.get("instances", [])
        for inst in instances:
            size = inst["endLine"] - inst["startLine"] + 1
            total_lines += size
            total_instances += 1
    if total_instances == 0:
        return 0
    return total_lines / total_instances

def average_chunks_per_file():
    """Compute the average number of chunks per file."""
    files_count = db["files"].count_documents({})
    chunks_count = db["chunks"].count_documents({})
    if files_count == 0:
        return 0
    return chunks_count / files_count

# Main monitoring loop
while True:
    timestamp = datetime.now().isoformat()
    counts = get_counts()
    
    # Compute metrics
    avg_clone_size = average_clone_size()
    avg_chunks_file = average_chunks_per_file()
    
    # Print status updates
    updates = get_new_status_updates()
    for u in updates:
        ts = u.get("timestamp", "unknown time")
        msg = u.get("message", "no message")
        print(f"[{ts}] {msg}")
    
    # Print overall metrics
    print(f"[{timestamp}] Counts: {counts}, "
          f"Average clone size: {avg_clone_size:.2f} lines, "
          f"Average chunks per file: {avg_chunks_file:.2f}")
    
    time.sleep(INTERVAL)
