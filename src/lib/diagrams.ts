// Diagram specs lifted verbatim from the approved mockup (the assets/diagrams kit renders them).
import type { Mode } from './modes';

export const HERO_DIAGRAM: unknown = {
  "layout": "free",
  "alt": "Grafik tautan Wikipedia: dari Kucing lewat Asia dan Jepang ke Gunung Fuji, jalur terpendek berdenyut.",
  "motion": {
    "cycle": 3.4
  },
  "nodes": [
    {
      "id": "kucing",
      "label": "Kucing",
      "meta": "mulai",
      "at": [
        0.14,
        0.5
      ],
      "atCompact": [
        0.5,
        0.1
      ]
    },
    {
      "id": "mesir",
      "label": "Mesir Kuno",
      "at": [
        0.4,
        0.17
      ],
      "atCompact": [
        0.2,
        0.32
      ]
    },
    {
      "id": "asia",
      "label": "Asia",
      "at": [
        0.42,
        0.78
      ],
      "atCompact": [
        0.78,
        0.32
      ]
    },
    {
      "id": "giza",
      "label": "Piramida Agung Giza",
      "at": [
        0.76,
        0.12
      ],
      "atCompact": [
        0.2,
        0.6
      ]
    },
    {
      "id": "jepang",
      "label": "Jepang",
      "at": [
        0.72,
        0.52
      ],
      "atCompact": [
        0.78,
        0.6
      ]
    },
    {
      "id": "fuji",
      "label": "Gunung Fuji",
      "meta": "target",
      "done": true,
      "at": [
        0.86,
        0.88
      ],
      "atCompact": [
        0.5,
        0.88
      ]
    }
  ],
  "edges": [
    {
      "from": "kucing",
      "to": "asia",
      "curve": "elbow"
    },
    {
      "from": "asia",
      "to": "jepang",
      "curve": "elbow"
    },
    {
      "from": "jepang",
      "to": "fuji",
      "curve": "elbow"
    },
    {
      "from": "kucing",
      "to": "mesir",
      "curve": "elbow",
      "idle": true
    },
    {
      "from": "mesir",
      "to": "giza",
      "curve": "elbow",
      "idle": true
    },
    {
      "from": "mesir",
      "to": "asia",
      "curve": "elbow",
      "idle": true
    }
  ]
};

export const MODE_DIAGRAMS: Record<Mode, unknown> = {
  free: {
    "layout": "hub",
    "alt": "Free run: Kucing terhubung ke Mesir Kuno, Asia dan Jepang.",
    "motion": {
      "pulse": "none"
    },
    "center": {
      "label": "Kucing"
    },
    "spokes": [
      {
        "label": "Mesir Kuno"
      },
      {
        "label": "Asia"
      },
      {
        "label": "Jepang"
      }
    ]
  },
  trial: {
    "layout": "free",
    "alt": "Time trial: jalur terpendek Kucing, Asia, Jepang, Gunung Fuji disorot.",
    "motion": {
      "pulse": "none"
    },
    "nodes": [
      {
        "id": "a",
        "label": "Kucing",
        "at": [
          0.12,
          0.5
        ],
        "atCompact": [
          0.5,
          0.12
        ]
      },
      {
        "id": "b",
        "label": "Asia",
        "at": [
          0.38,
          0.3
        ],
        "atCompact": [
          0.5,
          0.38
        ]
      },
      {
        "id": "c",
        "label": "Jepang",
        "at": [
          0.64,
          0.3
        ],
        "atCompact": [
          0.5,
          0.64
        ]
      },
      {
        "id": "d",
        "label": "Gunung Fuji",
        "meta": "par 3",
        "done": true,
        "at": [
          0.88,
          0.5
        ],
        "atCompact": [
          0.5,
          0.88
        ]
      },
      {
        "id": "e",
        "label": "Mesir Kuno",
        "at": [
          0.4,
          0.78
        ],
        "atCompact": [
          0.15,
          0.5
        ]
      }
    ],
    "edges": [
      {
        "from": "a",
        "to": "b",
        "curve": "elbow"
      },
      {
        "from": "b",
        "to": "c"
      },
      {
        "from": "c",
        "to": "d",
        "curve": "elbow"
      },
      {
        "from": "a",
        "to": "e",
        "curve": "elbow",
        "idle": true
      },
      {
        "from": "e",
        "to": "b",
        "curve": "elbow",
        "idle": true
      }
    ]
  },
  random: {
    "layout": "free",
    "alt": "Random: simpul teracak, titik mulai berpindah tiap balapan.",
    "motion": {
      "pulse": "none"
    },
    "nodes": [
      {
        "id": "a",
        "label": "Piramida Agung Giza",
        "at": [
          0.2,
          0.2
        ],
        "atCompact": [
          0.3,
          0.12
        ]
      },
      {
        "id": "b",
        "label": "Jepang",
        "at": [
          0.7,
          0.28
        ],
        "atCompact": [
          0.7,
          0.36
        ]
      },
      {
        "id": "c",
        "label": "Mesir Kuno",
        "at": [
          0.3,
          0.72
        ],
        "atCompact": [
          0.3,
          0.62
        ]
      },
      {
        "id": "d",
        "label": "Asia",
        "at": [
          0.78,
          0.74
        ],
        "atCompact": [
          0.7,
          0.88
        ]
      }
    ],
    "edges": [
      {
        "from": "a",
        "to": "c",
        "curve": "elbow"
      },
      {
        "from": "c",
        "to": "d",
        "curve": "elbow"
      },
      {
        "from": "d",
        "to": "b",
        "curve": "elbow"
      },
      {
        "from": "b",
        "to": "a",
        "curve": "elbow",
        "idle": true
      }
    ]
  },
};
