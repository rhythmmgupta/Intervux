"""
Target-company catalog and company-aware question selection.

Each company declares the roles it hires for, the question categories its loops
lean on, and a few signature questions. Everything else is drawn from the shared
QUESTION_BANK filtered to that company's focus, so adding a company costs a dozen
lines rather than a fresh bank of twenty questions.
"""
import logging
import random
from typing import Any, Dict, List, Optional

from app.services.interview_service import QUESTION_BANK

logger = logging.getLogger(__name__)

COMPANIES: List[Dict[str, Any]] = [
    {
        "slug": "google",
        "name": "Google",
        "tier": "FAANG",
        "roles": ["Software Engineer", "SRE", "Data Scientist", "Product Manager"],
        "focus": ["DSA", "System Design", "OS"],
        "signature": [
            {"category": "DSA", "difficulty": "hard", "question": "Given a stream of integers, design a structure that returns the median in logarithmic time. Walk through your data structure choice and its trade-offs."},
            {"category": "System Design", "difficulty": "hard", "question": "Design Google Docs' real-time collaborative editing. How do you keep two simultaneous edits from corrupting the document?"},
            {"category": "DSA", "difficulty": "medium", "question": "Explain how you would detect a cycle in a directed graph, and why topological sort fails when one exists."},
        ],
    },
    {
        "slug": "microsoft",
        "name": "Microsoft",
        "tier": "FAANG",
        "roles": ["Software Engineer", "Cloud Solution Architect", "Data Engineer", "Program Manager"],
        "focus": ["DSA", "OOP", "System Design", "OS"],
        "signature": [
            {"category": "DSA", "difficulty": "medium", "question": "Reverse a linked list in place, then explain how you would detect whether the original list had a loop."},
            {"category": "OOP", "difficulty": "medium", "question": "Design a parking lot system using object-oriented principles. Which classes, which interfaces, and where would inheritance hurt you?"},
            {"category": "System Design", "difficulty": "medium", "question": "Design the backend for Microsoft Teams presence (online, away, busy) for 100 million users. How do you keep it cheap?"},
            {"category": "OS", "difficulty": "medium", "question": "A production service is at 100% CPU with low throughput. Walk me through how you would diagnose it from first principles."},
            {"category": "HR - Teamwork", "difficulty": "medium", "question": "Microsoft weighs collaboration heavily. Tell me about a time your idea was rejected by your team. What did you do next?"},
        ],
    },
    {
        "slug": "amazon",
        "name": "Amazon",
        "tier": "FAANG",
        "roles": ["SDE I", "SDE II", "Cloud Support Engineer", "Business Analyst"],
        "focus": ["DSA", "System Design", "DBMS"],
        "signature": [
            {"category": "HR - Leadership", "difficulty": "medium", "question": "Amazon runs on Leadership Principles. Give me an example of Customer Obsession from your own work, with the measurable outcome."},
            {"category": "HR - Failure", "difficulty": "medium", "question": "Tell me about a time you had to Dive Deep to find the root cause of a problem others had given up on."},
            {"category": "System Design", "difficulty": "hard", "question": "Design Amazon's order-fulfilment pipeline. How do you guarantee an order is never charged twice?"},
        ],
    },
    {
        "slug": "meta",
        "name": "Meta",
        "tier": "FAANG",
        "roles": ["Software Engineer", "Production Engineer", "Data Engineer"],
        "focus": ["DSA", "System Design", "Networks"],
        "signature": [
            {"category": "System Design", "difficulty": "hard", "question": "Design the News Feed ranking and delivery system. How do you serve a personalised feed in under 200ms?"},
            {"category": "DSA", "difficulty": "medium", "question": "Given two sorted arrays, find the k-th smallest element in logarithmic time. Explain why the naive merge is not good enough."},
        ],
    },
    {
        "slug": "apple",
        "name": "Apple",
        "tier": "FAANG",
        "roles": ["Software Engineer", "Hardware Engineer", "Machine Learning Engineer"],
        "focus": ["OOP", "OS", "DSA"],
        "signature": [
            {"category": "OS", "difficulty": "hard", "question": "Explain how you would debug a memory leak in a long-running application on a memory-constrained device."},
            {"category": "OOP", "difficulty": "medium", "question": "Apple values craft. Describe an interface you designed that you later had to change. What did the original design get wrong?"},
        ],
    },
    {
        "slug": "netflix",
        "name": "Netflix",
        "tier": "FAANG",
        "roles": ["Senior Software Engineer", "Data Engineer", "Reliability Engineer"],
        "focus": ["System Design", "Networks", "DBMS"],
        "signature": [
            {"category": "System Design", "difficulty": "hard", "question": "Design video streaming delivery for a global audience. How does adaptive bitrate interact with your CDN strategy?"},
            {"category": "HR - High Pressure", "difficulty": "hard", "question": "Netflix expects high autonomy. Describe a decision you made without approval that you would make again."},
        ],
    },
    {
        "slug": "nvidia",
        "name": "NVIDIA",
        "tier": "Product",
        "roles": ["Software Engineer", "CUDA Engineer", "Deep Learning Engineer"],
        "focus": ["OS", "DSA", "System Design"],
        "signature": [
            {"category": "OS", "difficulty": "hard", "question": "Explain memory coalescing on a GPU and why a naive matrix transpose is slow without shared memory."},
            {"category": "DSA", "difficulty": "hard", "question": "How would you parallelise a prefix sum (scan), and what is the work-depth trade-off versus the sequential version?"},
        ],
    },
    {
        "slug": "adobe",
        "name": "Adobe",
        "tier": "Product",
        "roles": ["Software Engineer", "Computer Scientist", "Product Designer"],
        "focus": ["DSA", "OOP", "DBMS"],
        "signature": [
            {"category": "OOP", "difficulty": "medium", "question": "Design the undo/redo system for an image editor. Which pattern, and how do you bound memory use?"},
        ],
    },
    {
        "slug": "tcs",
        "name": "TCS",
        "tier": "Indian IT",
        "roles": ["Systems Engineer", "Digital - Software Developer", "Ninja Trainee"],
        "focus": ["DBMS", "OOP", "Networks"],
        "signature": [
            {"category": "HR - Background", "difficulty": "easy", "question": "Walk me through your resume, and tell me why you want to begin your career at TCS specifically."},
            {"category": "DBMS", "difficulty": "easy", "question": "What is normalisation? Take a table to 3NF and explain what each step removed."},
            {"category": "HR - Career Goals", "difficulty": "easy", "question": "TCS asks for a service agreement and may post you to any location. How do you feel about relocation and the bond?"},
        ],
    },
    {
        "slug": "infosys",
        "name": "Infosys",
        "tier": "Indian IT",
        "roles": ["Systems Engineer", "Power Programmer", "Specialist Programmer"],
        "focus": ["DSA", "DBMS", "OOP"],
        "signature": [
            {"category": "DSA", "difficulty": "medium", "question": "Write the logic to find the second-largest element in an unsorted array in one pass, and prove it handles duplicates."},
            {"category": "HR - Strengths", "difficulty": "easy", "question": "Which programming language do you consider yourself strongest in, and what is the most complex thing you have built with it?"},
        ],
    },
    {
        "slug": "wipro",
        "name": "Wipro",
        "tier": "Indian IT",
        "roles": ["Project Engineer", "Turbo Developer", "Cloud Engineer"],
        "focus": ["DBMS", "Networks", "OS"],
        "signature": [
            {"category": "Networks", "difficulty": "easy", "question": "Explain the OSI model layer by layer, and give one real protocol that lives at each layer."},
        ],
    },
    {
        "slug": "accenture",
        "name": "Accenture",
        "tier": "Consulting",
        "roles": ["Associate Software Engineer", "Advanced App Engineer", "Technology Consultant"],
        "focus": ["DBMS", "OOP", "System Design"],
        "signature": [
            {"category": "HR - Teamwork", "difficulty": "medium", "question": "Consulting means working inside a client's team. Tell me about a time you had to win over someone who did not want your help."},
        ],
    },
    {
        "slug": "deloitte",
        "name": "Deloitte",
        "tier": "Consulting",
        "roles": ["Analyst", "Consultant - Technology", "Cyber Risk Analyst"],
        "focus": ["DBMS", "Networks", "System Design"],
        "signature": [
            {"category": "HR - High Pressure", "difficulty": "medium", "question": "A client escalates on a Friday evening over something your team missed. Walk me through your first hour."},
        ],
    },
    {
        "slug": "goldman-sachs",
        "name": "Goldman Sachs",
        "tier": "Finance",
        "roles": ["Software Engineer - Analyst", "Quant Strategist", "Risk Engineer"],
        "focus": ["DSA", "DBMS", "System Design"],
        "signature": [
            {"category": "DSA", "difficulty": "hard", "question": "Design a limit order book. Which data structures give you O(1) best bid/ask with fast cancels?"},
            {"category": "DBMS", "difficulty": "hard", "question": "A trade-settlement table has grown to two billion rows and reporting queries time out. What do you change first?"},
        ],
    },
]

COMPANIES_BY_SLUG = {c["slug"]: c for c in COMPANIES}


class CompanyService:
    def list_companies(self, tier: Optional[str] = None) -> List[Dict[str, Any]]:
        """Catalog entries without the question payloads, for the selection screen."""
        rows = COMPANIES if not tier else [c for c in COMPANIES if c["tier"].lower() == tier.lower()]
        return [
            {
                "slug": c["slug"],
                "name": c["name"],
                "tier": c["tier"],
                "roles": c["roles"],
                "focus": c["focus"],
                "question_pool": len(self._pool(c)),
            }
            for c in rows
        ]

    def get_company(self, slug: str) -> Optional[Dict[str, Any]]:
        return COMPANIES_BY_SLUG.get((slug or "").lower())

    def _pool(self, company: Dict[str, Any], interview_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Signature questions first, then the shared bank narrowed to this company's focus."""
        focus = set(company["focus"])
        shared = [q for q in QUESTION_BANK if q["category"] in focus]
        # HR rounds happen everywhere, so behavioural questions stay available to all.
        shared += [q for q in QUESTION_BANK if q["category"].startswith("HR")]
        pool = company["signature"] + shared

        if interview_type == "technical":
            pool = [q for q in pool if not q["category"].startswith("HR")]
        elif interview_type == "hr":
            pool = [q for q in pool if q["category"].startswith("HR")]

        # De-duplicate by text, keeping signature questions ahead of generic ones.
        seen, unique = set(), []
        for q in pool:
            if q["question"] not in seen:
                seen.add(q["question"])
                unique.append(q)
        return unique

    def select_questions(
        self,
        slug: str,
        interview_type: str = "technical",
        difficulty: str = "medium",
        limit: int = 5,
        role: Optional[str] = None,
        seed: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Pick `limit` questions for a company round. Difficulty-matched questions
        come first; the rest of the company pool fills any shortfall.
        A `seed` makes the selection reproducible, which is what contests need so
        every attendee sees the same set.
        """
        company = self.get_company(slug)
        if not company:
            return []

        pool = self._pool(company, interview_type)
        matched = [q for q in pool if q["difficulty"] == difficulty]
        rest = [q for q in pool if q["difficulty"] != difficulty]

        if seed is not None:
            rng = random.Random(seed)
            rng.shuffle(matched)
            rng.shuffle(rest)

        selected = (matched + rest)[:limit]
        for q in selected:
            q = dict(q)
        return [
            {**q, "company": company["name"], "target_role": role or company["roles"][0]}
            for q in selected
        ]


company_service = CompanyService()
