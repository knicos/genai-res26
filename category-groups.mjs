export const categoryGroups = [
  {
    id: "producer",
    name: "Producer",
    categories: [
      "Government or Statutory Body",
      "Non-Governmental Organisation (NGO)",
      "Company",
      "Educational Institution",
      "International Organisation or Body",
      "Other or unknown producer",
    ],
  },
  {
    id: "audience",
    name: "Audience",
    categories: [
      "K-12",
      "Teachers",
      "Tertiary Education",
      "Adult Education",
      "Policy Makers",
      "Researchers",
      "Industry",
      "Other or unknown audience",
    ],
  },
  {
    id: "type",
    name: "Type",
    categories: [
      "Frameworks and Standards",
      "Curriculum and Qualifications",
      "Teaching Tools and Resources",
      "Policy and Strategy",
      "Projects and Pilots",
      "Research and Evidence",
      "Guidance and Recommendations",
      "Training and Professional Development",
      "Legal and Regulatory",
      "Tools and Instruments",
      "Other type or unknown",
    ],
  },
  {
    id: "topic",
    name: "Topic",
    categories: [
      "Using AI",
      "Understanding AI",
      "Workforce and Technical skills",
      "Societal Impacts of AI",
      "Ethics of AI and Rights",
      "Assessment and Integrity",
      "Safety and Privacy",
      "Media Literacy",
      "Data Literacy",
      "Other or unknown topic",
    ],
  },
];

const groupByCategory = new Map(categoryGroups.flatMap(group =>
  group.categories.map(category => [category, group]),
));

export function categoryGroup(category) {
  return groupByCategory.get(category) ?? null;
}
