import time
import logging
from collections import OrderedDict
from threading import Lock, Event

logger = logging.getLogger("JourneyAI.Cache")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

class TTLCache:
    """Thread-safe LRU Cache with Time-To-Live (TTL) expiration."""
    def __init__(self, maxsize=200, ttl=3600):
        self.maxsize = maxsize
        self.ttl = ttl
        self.cache = OrderedDict()
        self.lock = Lock()
        
    def get(self, key):
        with self.lock:
            if key not in self.cache:
                print(f"💾 [Cache Miss] Key: {key}")
                return None
            val, expire = self.cache[key]
            if time.time() > expire:
                print(f"💾 [Cache Expired] Key: {key}")
                del self.cache[key]
                return None
            # Move to end (LRU)
            self.cache.move_to_end(key)
            print(f"💾 [Cache Hit] Key: {key}")
            return val
            
    def set(self, key, value):
        with self.lock:
            expire = time.time() + self.ttl
            if key in self.cache:
                del self.cache[key]
            elif len(self.cache) >= self.maxsize:
                # Evict oldest entry (LRU)
                evicted, _ = self.cache.popitem(last=False)
                print(f"💾 [Cache Evict] Evicted oldest key: {evicted}")
            self.cache[key] = (value, expire)
            print(f"💾 [Cache Set] Key: {key} (TTL: {self.ttl}s)")


class SingleFlight:
    """Thread-safe Request Collapsing coordinator (Single Flight pattern)."""
    def __init__(self):
        self.active = {}
        self.lock = Lock()
        
    def run(self, key, func, *args, **kwargs):
        with self.lock:
            if key in self.active:
                event, result_box = self.active[key]
                is_leader = False
                logger.info(f"🚀 [SingleFlight Collapse] Collapsed duplicate request. Waiting on leader for key: {key[:30]}...")
            else:
                event = Event()
                result_box = {}
                self.active[key] = (event, result_box)
                is_leader = True
                logger.info(f"🚀 [SingleFlight Leader] Spawning execution leader for key: {key[:30]}...")
                
        if is_leader:
            try:
                res = func(*args, **kwargs)
                result_box['res'] = res
            except Exception as e:
                result_box['err'] = e
            finally:
                event.set()
                with self.lock:
                    if key in self.active:
                        del self.active[key]
            if 'err' in result_box:
                raise result_box['err']
            return result_box['res']
        else:
            event.wait()
            if 'err' in result_box:
                raise result_box['err']
            return result_box['res']
