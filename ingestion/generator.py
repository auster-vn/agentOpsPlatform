"""
AgentOps Platform - AI Agent Event Simulator
Generates realistic, correlated AI agent events and streams them to Kafka.
Supports 5 agent types with distinct behavioral profiles.
"""

import json
import uuid
import time
import random
import os
import logging
from datetime import datetime, timezone
from kafka import KafkaProducer
from kafka.errors import KafkaError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9094")
EVENTS_PER_SECOND = float(os.getenv("EVENTS_PER_SECOND", "5"))

# =====================================================
# AGENT BEHAVIORAL PROFILES
# =====================================================
AGENTS = {
    "support_agent": {
        "name": "Customer Support Agent",
        "latency_range": (300, 1500),
        "token_range": (150, 600),
        "cost_per_token": 0.000015,
        "error_rate": 0.05,
        "hallucination_base": 0.08,
        "tool_count_range": (0, 2),
        "model": "gpt-3.5-turbo",
    },
    "coding_agent": {
        "name": "Code Assistant Agent",
        "latency_range": (800, 4000),
        "token_range": (400, 2000),
        "cost_per_token": 0.000030,
        "error_rate": 0.08,
        "hallucination_base": 0.05,
        "tool_count_range": (1, 5),
        "model": "gpt-4-turbo",
    },
    "sales_agent": {
        "name": "Sales Intelligence Agent",
        "latency_range": (500, 2500),
        "token_range": (200, 900),
        "cost_per_token": 0.000020,
        "error_rate": 0.12,
        "hallucination_base": 0.18,
        "tool_count_range": (1, 4),
        "model": "gpt-4o",
    },
    "hr_agent": {
        "name": "HR Assistant Agent",
        "latency_range": (200, 1000),
        "token_range": (100, 450),
        "cost_per_token": 0.000012,
        "error_rate": 0.04,
        "hallucination_base": 0.06,
        "tool_count_range": (0, 2),
        "model": "gpt-3.5-turbo",
    },
    "knowledge_agent": {
        "name": "Knowledge Base Agent",
        "latency_range": (600, 3000),
        "token_range": (300, 1500),
        "cost_per_token": 0.000025,
        "error_rate": 0.06,
        "hallucination_base": 0.10,
        "tool_count_range": (2, 6),
        "model": "gpt-4o",
    },
}

# =====================================================
# REALISTIC CONTENT TEMPLATES
# =====================================================
QUESTIONS = {
    "support_agent": [
        "How do I reset my password?",
        "My payment failed, what should I do?",
        "I can't access my account.",
        "How do I cancel my subscription?",
        "Why was I charged twice?",
        "How do I update my billing information?",
        "Where can I download the latest invoice?",
        "How do I contact a human agent?",
        "My package hasn't arrived yet.",
        "Can I change my delivery address?",
    ],
    "coding_agent": [
        "How do I implement a binary search tree in Python?",
        "What's the best way to handle async errors in JavaScript?",
        "Explain Docker multi-stage builds.",
        "How do I optimize a slow SQL query?",
        "What is a race condition and how to fix it?",
        "Write a Kubernetes deployment YAML for a Flask app.",
        "How do I set up CI/CD with GitHub Actions?",
        "Explain the differences between REST and GraphQL.",
        "How to implement JWT authentication in FastAPI?",
        "Debug this React useEffect infinite loop.",
    ],
    "sales_agent": [
        "What's our win rate against Salesforce this quarter?",
        "Generate a personalized pitch for a fintech prospect.",
        "What are the top objections from enterprise customers?",
        "Summarize competitor pricing for the APAC market.",
        "Draft a follow-up email for a stalled deal.",
        "What's the average deal cycle for mid-market?",
        "Identify at-risk accounts with ARR > $100k.",
        "What's our MRR growth trend?",
        "Suggest upsell opportunities for existing customers.",
        "Create a ROI calculator for a prospect.",
    ],
    "hr_agent": [
        "How many vacation days do I have left?",
        "What is the remote work policy?",
        "How do I submit a reimbursement request?",
        "When is performance review season?",
        "What benefits are included in my package?",
        "How do I refer a candidate for a job opening?",
        "What is the parental leave policy?",
        "How do I update my emergency contact?",
        "When do stock options vest?",
        "How do I request a salary review?",
    ],
    "knowledge_agent": [
        "What's our SLA for critical incidents?",
        "How do we handle GDPR data requests?",
        "What is the product roadmap for Q3?",
        "Summarize the security compliance requirements.",
        "What are the API rate limits?",
        "How does the recommendation engine work?",
        "What's the data retention policy?",
        "Summarize the change management process.",
        "How do we onboard enterprise clients?",
        "What is the escalation path for P1 incidents?",
    ],
}

CONTEXTS = [
    "Based on our internal documentation updated last month...",
    "According to the company policy handbook v2.3...",
    "Our platform documentation states...",
    "The knowledge base article KB-2024-001 explains...",
    "Based on the data in our CRM system...",
    "Our engineering wiki documents the following...",
    "The compliance framework defines...",
    "Historical support data from the last 6 months...",
    "Our product documentation covers...",
    "The process diagram SP-001 outlines...",
]

RESPONSES = {
    "support_agent": [
        "To reset your password, go to Settings > Security > Reset Password and follow the email instructions.",
        "Your payment failed due to insufficient funds. Please update your payment method in the Billing section.",
        "I've escalated your account access issue to our security team. You'll hear back within 2 hours.",
        "To cancel, navigate to Account > Subscription > Cancel Plan. Note: changes take effect at the end of your billing cycle.",
        "I can see a duplicate charge. I've initiated a refund that will appear in 3-5 business days.",
    ],
    "coding_agent": [
        "Here's a complete BST implementation in Python with insert, search, and delete operations...",
        "For async error handling in JavaScript, use try-catch with async/await or .catch() with Promises...",
        "Multi-stage Docker builds separate the build environment from the runtime, reducing image size by up to 80%...",
        "To optimize your SQL query, start by adding indexes on the columns in your WHERE and JOIN clauses...",
        "A race condition occurs when two threads access shared data concurrently. Use locks or atomic operations to fix it...",
    ],
    "sales_agent": [
        "Our Q3 win rate against Salesforce is 34%, up from 28% in Q2. Key differentiators: pricing and AI features.",
        "Here's a personalized pitch highlighting the 40% efficiency gain our platform provides for fintech companies...",
        "Top 3 enterprise objections: integration complexity, security compliance, and pricing model. Here's how to address each...",
        "APAC competitor pricing analysis shows we are 15-20% below market average with superior AI capabilities...",
        "Follow-up email draft: Subject: 'Quick question about your Q4 goals' - emphasizing the ROI calculation...",
    ],
    "hr_agent": [
        "You have 12 vacation days remaining for this year. Remember, unused days roll over up to 5 days.",
        "Our remote work policy allows up to 3 days per week from home for most roles. Fully remote requires manager approval.",
        "Submit reimbursements via the Workday portal under My Account > Expenses. Receipts required for amounts over $25.",
        "Performance reviews are scheduled for March and September. Self-assessments due 2 weeks before.",
        "Your benefits package includes: health, dental, vision, 401k (4% match), and $1,500 annual learning budget.",
    ],
    "knowledge_agent": [
        "Our SLA for critical (P1) incidents is: acknowledgment within 15 minutes, resolution within 4 hours.",
        "GDPR data requests must be completed within 30 days. The process involves legal review and data extraction.",
        "Q3 roadmap highlights: AI-powered search, mobile app redesign, and enterprise SSO integration.",
        "SOC 2 Type II compliance requires annual audits, encryption at rest, and role-based access controls.",
        "API rate limits: 1000 req/min for standard tier, 10,000 req/min for enterprise. Burst allowance: 2x for 60 seconds.",
    ],
}

TOOL_NAMES = [
    "search_knowledge_base",
    "query_database",
    "send_email",
    "create_ticket",
    "fetch_customer_data",
    "run_code_interpreter",
    "search_web",
    "update_crm",
    "get_pricing_data",
    "retrieve_document",
]

ERROR_TYPES = [
    "timeout",
    "rate_limit_exceeded",
    "context_length_exceeded",
    "tool_execution_failed",
    "invalid_request",
    "internal_server_error",
    "authentication_failed",
]


# =====================================================
# KAFKA PRODUCER SETUP
# =====================================================
def create_producer():
    """Create Kafka producer with retry logic."""
    max_retries = 10
    for attempt in range(max_retries):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda v: v.encode("utf-8") if v else None,
                acks="all",
                retries=3,
                max_block_ms=10000,
                request_timeout_ms=30000,
            )
            logger.info(f"✅ Connected to Kafka at {KAFKA_BOOTSTRAP_SERVERS}")
            return producer
        except Exception as e:
            wait_secs = 5 * (attempt + 1)
            logger.warning(f"Kafka not ready (attempt {attempt+1}/{max_retries}): {e}. Retrying in {wait_secs}s...")
            time.sleep(wait_secs)
    raise RuntimeError("Could not connect to Kafka after maximum retries")


def on_send_success(record_metadata):
    pass  # Silence successful sends for throughput


def on_send_error(exc):
    logger.error(f"❌ Kafka send error: {exc}")


# =====================================================
# EVENT GENERATORS
# =====================================================
def generate_conversation_event(agent_id: str) -> dict:
    """Generate a realistic AI Agent conversation event."""
    profile = AGENTS[agent_id]
    conversation_id = str(uuid.uuid4())
    latency = random.randint(*profile["latency_range"])
    token_count = random.randint(*profile["token_range"])
    cost = token_count * profile["cost_per_token"] * random.uniform(0.8, 1.2)
    is_error = random.random() < profile["error_rate"]
    success = not is_error

    question = random.choice(QUESTIONS[agent_id])
    context = random.choice(CONTEXTS)

    if success:
        response = random.choice(RESPONSES[agent_id])
    else:
        response = ""

    # Hallucination score: higher if agent is sales or response is long
    base_hallucination = profile["hallucination_base"]
    hallucination_noise = random.gauss(0, 0.05)
    hallucination_score = max(0.0, min(1.0, base_hallucination + hallucination_noise))

    # Failure probability feature: driven by latency and token count
    failure_prob = min(1.0, (latency / 5000) * 0.5 + (1 if is_error else 0) * 0.4)

    tool_count = random.randint(*profile["tool_count_range"])

    return {
        "event_type": "conversation",
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "agent_name": profile["name"],
        "model": profile["model"],
        "user_question": question,
        "context": context,
        "agent_response": response,
        "latency_ms": latency,
        "token_count": token_count,
        "cost": round(cost, 6),
        "success": success,
        "tool_count": tool_count,
        "hallucination_score": round(hallucination_score, 4),
        "failure_probability": round(failure_prob, 4),
        "feedback_score": round(random.uniform(3.0, 5.0), 2) if success else round(random.uniform(1.0, 3.0), 2),
        "session_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def generate_tool_call_event(conversation_id: str, agent_id: str) -> dict:
    """Generate a tool call event tied to a conversation."""
    tool_name = random.choice(TOOL_NAMES)
    success = random.random() > 0.08
    return {
        "event_type": "tool_call",
        "call_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "tool_name": tool_name,
        "latency_ms": random.randint(50, 800),
        "success": success,
        "error_message": random.choice(["Connection timeout", "Invalid response", "Rate limited"]) if not success else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def generate_error_event(conversation_id: str, agent_id: str) -> dict:
    """Generate an error event."""
    error_type = random.choice(ERROR_TYPES)
    severity = "critical" if error_type in ["internal_server_error", "authentication_failed"] else "warning"
    return {
        "event_type": "error",
        "error_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "error_type": error_type,
        "error_message": f"Agent {agent_id} encountered: {error_type}",
        "severity": severity,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def generate_feedback_event(conversation_id: str, agent_id: str, score: float) -> dict:
    """Generate a user feedback event."""
    return {
        "event_type": "feedback",
        "feedback_id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "agent_id": agent_id,
        "score": round(score, 2),
        "sentiment": "positive" if score >= 4.0 else "neutral" if score >= 3.0 else "negative",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# =====================================================
# MAIN GENERATION LOOP
# =====================================================
def run_generator():
    """Main loop: continuously generate and publish events."""
    producer = create_producer()
    agent_ids = list(AGENTS.keys())

    total_events = 0
    start_time = time.time()
    interval = 1.0 / EVENTS_PER_SECOND

    logger.info(f"🚀 Starting event generation at {EVENTS_PER_SECOND} events/second...")

    while True:
        try:
            # Pick a random agent with weighted probability (support is most active)
            agent_id = random.choices(
                agent_ids,
                weights=[0.35, 0.20, 0.20, 0.10, 0.15],
                k=1
            )[0]

            # Generate core conversation event
            conv_event = generate_conversation_event(agent_id)
            conversation_id = conv_event["conversation_id"]

            # Publish conversation event
            producer.send(
                "agent_events",
                key=agent_id,
                value=conv_event
            ).add_callback(on_send_success).add_errback(on_send_error)

            total_events += 1

            # Generate correlated tool call events
            for _ in range(conv_event["tool_count"]):
                tool_event = generate_tool_call_event(conversation_id, agent_id)
                producer.send(
                    "tool_calls",
                    key=agent_id,
                    value=tool_event
                ).add_errback(on_send_error)
                total_events += 1

            # Generate error events for failed conversations
            if not conv_event["success"]:
                error_event = generate_error_event(conversation_id, agent_id)
                producer.send(
                    "errors",
                    key=agent_id,
                    value=error_event
                ).add_errback(on_send_error)
                total_events += 1

            # Generate feedback event with 70% probability for successful conversations
            if conv_event["success"] and random.random() < 0.70:
                feedback_event = generate_feedback_event(
                    conversation_id, agent_id, conv_event["feedback_score"]
                )
                producer.send(
                    "feedbacks",
                    key=agent_id,
                    value=feedback_event
                ).add_errback(on_send_error)
                total_events += 1

            # Flush every 100 events
            if total_events % 100 == 0:
                producer.flush()
                elapsed = time.time() - start_time
                rate = total_events / elapsed
                logger.info(f"📊 Generated {total_events:,} total events | Rate: {rate:.1f} ev/s | "
                            f"Agent: {agent_id}")

            time.sleep(interval)

        except KeyboardInterrupt:
            logger.info("⏹ Generator stopped by user.")
            break
        except Exception as e:
            logger.error(f"Error in generation loop: {e}")
            time.sleep(1)
            continue

    producer.flush()
    producer.close()
    logger.info(f"✅ Generator finished. Total events published: {total_events:,}")


if __name__ == "__main__":
    run_generator()
