import type { LeetCodeSubmissionDetails } from "../types";

// Field names independently confirmed live: a manual console request using
// this exact query against a real submission returned statusDisplay,
// runtime stats, code, and full question data correctly. If it ever stops
// working, re-verify against the Network tab on a submission result.
const SUBMISSION_DETAILS_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      statusDisplay
      runtime
      runtimeDisplay
      runtimePercentile
      memory
      memoryDisplay
      memoryPercentile
      code
      lang {
        name
      }
      question {
        questionId
        title
        titleSlug
        content
        difficulty
        topicTags {
          name
        }
      }
    }
  }
`;

interface RawSubmissionDetails {
  statusDisplay: string;
  runtime: string;
  runtimeDisplay: string;
  runtimePercentile: number | null;
  memory: string;
  memoryDisplay: string;
  memoryPercentile: number | null;
  code: string;
  lang: { name: string };
  question: {
    questionId: string;
    title: string;
    titleSlug: string;
    content: string;
    difficulty: "Easy" | "Medium" | "Hard";
    topicTags: { name: string }[];
  };
}

export async function fetchSubmissionDetails(
  submissionId: string
): Promise<LeetCodeSubmissionDetails> {
  const res = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: SUBMISSION_DETAILS_QUERY,
      variables: { submissionId: Number(submissionId) },
      operationName: "submissionDetails",
    }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL request failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    data?: { submissionDetails?: RawSubmissionDetails };
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(
      `LeetCode GraphQL error: ${body.errors.map((e) => e.message).join(", ")}`
    );
  }

  const raw = body.data?.submissionDetails;
  if (!raw) {
    throw new Error("LeetCode GraphQL response had no submissionDetails");
  }

  return {
    statusDisplay: raw.statusDisplay,
    runtime: raw.runtime,
    runtimeDisplay: raw.runtimeDisplay,
    runtimePercentile: raw.runtimePercentile,
    memory: raw.memory,
    memoryDisplay: raw.memoryDisplay,
    memoryPercentile: raw.memoryPercentile,
    code: raw.code,
    lang: raw.lang.name,
    question: raw.question,
  };
}

// The submission result renders inline on the page as soon as judging
// starts, but statusDisplay can still be empty for a moment after that.
// Retry with a short pause instead of asking only once.
export async function fetchSubmissionDetailsUntilGraded(
  submissionId: string,
  maxAttempts = 6,
  delayMs = 1000
): Promise<LeetCodeSubmissionDetails> {
  let details = await fetchSubmissionDetails(submissionId);
  let attempt = 1;
  while (!details.statusDisplay && attempt < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    details = await fetchSubmissionDetails(submissionId);
    attempt++;
  }
  return details;
}

// Powers the "All Submissions" tab on a problem page — used here to find
// the id of the submission that was just judged, since LeetCode's current
// site never navigates to a URL containing that id. Field/argument names
// are a best guess at the public schema (offset/limit pagination is the
// commonly documented shape; some LeetCode API versions use a cursor
// instead) — not yet checked against a live Network-tab capture. If this
// ever comes back empty for a problem just solved, verify live.
const RECENT_SUBMISSION_QUERY = `
  query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
    questionSubmissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
      submissions {
        id
        statusDisplay
        timestamp
      }
    }
  }
`;

export async function getMostRecentSubmissionId(
  titleSlug: string
): Promise<string | null> {
  const res = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: RECENT_SUBMISSION_QUERY,
      variables: { offset: 0, limit: 1, questionSlug: titleSlug },
      operationName: "submissionList",
    }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL request failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    data?: { questionSubmissionList?: { submissions: { id: string }[] } };
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    console.warn(
      "[CodeLedger] submissionList query returned errors:",
      body.errors
    );
    throw new Error(
      `LeetCode GraphQL error: ${body.errors.map((e) => e.message).join(", ")}`
    );
  }

  const submissions = body.data?.questionSubmissionList?.submissions;
  if (!submissions || submissions.length === 0) {
    console.warn(
      "[CodeLedger] submissionList query returned no submissions for",
      titleSlug,
      "— raw response:",
      body
    );
    return null;
  }
  return submissions[0]!.id;
}

// Same query LeetCode's own navbar uses to show your username — public
// field names, independently confirmed via a live manual console test.
const USER_STATUS_QUERY = `
  query globalData {
    userStatus {
      isSignedIn
      username
    }
  }
`;

export async function getCurrentLeetCodeUsername(): Promise<string | null> {
  const res = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: USER_STATUS_QUERY,
      operationName: "globalData",
    }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL request failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    data?: { userStatus?: { isSignedIn: boolean; username: string } };
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    console.warn("[CodeLedger] userStatus query returned errors:", body.errors);
    throw new Error(
      `LeetCode GraphQL error: ${body.errors.map((e) => e.message).join(", ")}`
    );
  }

  const status = body.data?.userStatus;
  if (!status?.isSignedIn) {
    console.warn(
      "[CodeLedger] userStatus query didn't report signed-in — raw response:",
      body
    );
    return null;
  }
  return status.username;
}
