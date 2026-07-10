"""
JourneyAI Vector Store - Semantic RAG using ChromaDB.
Falls back to keyword search if ChromaDB unavailable.
"""
import os
import logging

logger = logging.getLogger(__name__)

try:
    import chromadb
    from sentence_transformers import SentenceTransformer
    VECTOR_AVAILABLE = True
except ImportError:
    VECTOR_AVAILABLE = False
    logger.warning('[VectorStore] ChromaDB not available - using keyword fallback.')

_client = None
_collection = None
_model = None
_initialized = False


def _get_db_path():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base, '.vectordb')
    os.makedirs(db_path, exist_ok=True)
    return db_path


def _load_chunks():
    try:
        from backend.knowledge_base import TRAVEL_CHUNKS
        return TRAVEL_CHUNKS
    except ImportError:
        pass
    try:
        from knowledge_base import TRAVEL_CHUNKS
        return TRAVEL_CHUNKS
    except ImportError:
        return []


def initialize():
    global _client, _collection, _model, _initialized
    if _initialized:
        return VECTOR_AVAILABLE and _collection is not None
    if not VECTOR_AVAILABLE:
        _initialized = True
        return False
    try:
        chunks = _load_chunks()
        if not chunks:
            logger.error('[VectorStore] No chunks found.')
            _initialized = True
            return False
        logger.info('[VectorStore] Initializing sentence-transformers model...')
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        _client = chromadb.PersistentClient(path=_get_db_path())
        existing = [c.name for c in _client.list_collections()]
        if 'travel_knowledge' in existing:
            _collection = _client.get_collection('travel_knowledge')
            if _collection.count() >= len(chunks):
                _initialized = True
                return True
            _client.delete_collection('travel_knowledge')
        _collection = _client.create_collection('travel_knowledge', metadata={'hnsw:space': 'cosine'})
        ids = [c['id'] for c in chunks]
        docs = [c['text'] for c in chunks]
        metas = [{'dest': c['dest'], 'cat': c['cat']} for c in chunks]
        embeddings = _model.encode(docs, show_progress_bar=False).tolist()
        _collection.upsert(ids=ids, documents=docs, embeddings=embeddings, metadatas=metas)
        logger.info(f'[VectorStore] Ready with {len(chunks)} chunks.')
        _initialized = True
        return True
    except Exception as e:
        logger.error(f'[VectorStore] Init error: {e}')
        _initialized = True
        return False


def retrieve(query, destination='', n_results=4):
    if VECTOR_AVAILABLE and _collection is not None and _model is not None:
        return _vector_retrieve(query, destination, n_results)
    return _keyword_retrieve(query, destination, n_results)


def _vector_retrieve(query, destination, n_results):
    try:
        enhanced = (query + ' ' + destination).strip()
        emb = _model.encode([enhanced]).tolist()
        DEST_MAP = {
            'goa': 'Goa', 'jaipur': 'Jaipur', 'udaipur': 'Udaipur',
            'kerala': 'Kerala', 'alleppey': 'Alleppey', 'munnar': 'Munnar',
            'manali': 'Manali', 'leh': 'Leh', 'ladakh': 'Leh',
            'varanasi': 'Varanasi', 'banaras': 'Varanasi',
            'mumbai': 'Mumbai', 'delhi': 'Delhi', 'agra': 'Agra',
            'andaman': 'Andaman', 'meghalaya': 'Meghalaya', 'jaisalmer': 'Jaisalmer'
        }
        where = None
        if destination:
            dl = destination.lower()
            matched = next((v for k, v in DEST_MAP.items() if k in dl), None)
            if matched:
                where = {'dest': {'$in': [matched, 'India']}}
        params = {'query_embeddings': emb, 'n_results': n_results, 'include': ['documents', 'metadatas', 'distances']}
        if where:
            params['where'] = where
        res = _collection.query(**params)
        out = []
        if res and res.get('documents'):
            docs = res['documents'][0]
            metas = res['metadatas'][0]
            dists = res['distances'][0]
            seen = set()
            for doc, meta, dist in zip(docs, metas, dists):
                score = max(0, 1 - dist)
                if score > 0.35:
                    doc_clean = doc.strip()
                    if doc_clean not in seen:
                        seen.add(doc_clean)
                        out.append({'text': doc, 'dest': meta.get('dest', ''), 'cat': meta.get('cat', ''), 'score': round(score, 3)})
        return out
    except Exception as e:
        logger.error(f'[VectorStore] Query error: {e}')
        return _keyword_retrieve(query, destination, n_results)


def _keyword_retrieve(query, destination, n_results):
    chunks = _load_chunks()
    words = set((query + ' ' + destination).lower().split())
    scored = []
    for c in chunks:
        s = sum(1 for w in words if len(w) > 3 and w in c['text'].lower())
        if destination and destination.lower() in c['dest'].lower():
            s += 3
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{'text': c['text'], 'dest': c['dest'], 'cat': c['cat'], 'score': s / 10} for s, c in scored[:n_results]]


def build_context(query, destination='', max_chars=2500):
    if not _initialized:
        initialize()
    chunks = retrieve(query, destination, n_results=4)
    if not chunks:
        return ''
    lines = ['[RETRIEVED TRAVEL_KNOWLEDGE]']
    total = 0
    for c in chunks:
        entry = '\n- [' + c['cat'].upper() + ' | ' + c['dest'] + '] ' + c['text']
        if total + len(entry) > max_chars:
            break
        lines.append(entry)
        total += len(entry)
    return '\n'.join(lines)
