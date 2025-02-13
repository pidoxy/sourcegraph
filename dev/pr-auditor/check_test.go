package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckTestPlan(t *testing.T) {
	tests := []struct {
		name     string
		bodyFile string
		want     checkResult
	}{
		{
			name:     "has test plan",
			bodyFile: "testdata/pull_request_body/has-plan.md",
			want: checkResult{
				Reviewed: false,
				TestPlan: "I have a plan!",
			},
		},
		{
			name:     "no test plan",
			bodyFile: "testdata/pull_request_body/no-plan.md",
			want: checkResult{
				Reviewed: false,
			},
		},
		{
			name:     "complicated test plan",
			bodyFile: "testdata/pull_request_body/has-plan-fancy.md",
			want: checkResult{
				Reviewed: false,
				TestPlan: `This is a plan!
Quite lengthy

And a little complicated; there's also the following reasons:

1. A
2. B
3. C`,
			},
		},
		{
			name:     "inline test plan",
			bodyFile: "testdata/pull_request_body/inline-plan.md",
			want: checkResult{
				Reviewed: false,
				TestPlan: `This is a plan!
Quite lengthy

And a little complicated; there's also the following reasons:

1. A
2. B
3. C`,
			},
		},
		{
			name:     "no review required",
			bodyFile: "testdata/pull_request_body/no-review-required.md",
			want: checkResult{
				Reviewed: true,
				TestPlan: "I have a plan! No review required: this is a bot PR",
			},
		},
		{
			name:     "bad markdown still passes",
			bodyFile: "testdata/pull_request_body/bad-markdown.md",
			want: checkResult{
				Reviewed: true,
				TestPlan: "This is still a plan! No review required: just trust me",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, err := os.ReadFile(tt.bodyFile)
			require.NoError(t, err)

			got := checkPR(context.Background(), nil, &EventPayload{
				PullRequest: PullRequestPayload{
					Body: string(body),
				},
			}, checkOpts{
				ValidateReviews: false,
			})
			assert.Equal(t, tt.want.HasTestPlan(), got.HasTestPlan())
			t.Log("got.TestPlan: ", got.TestPlan)
			if tt.want.TestPlan == "" {
				assert.Empty(t, got.TestPlan)
			} else {
				assert.True(t, strings.Contains(got.TestPlan, tt.want.TestPlan),
					cmp.Diff(got.TestPlan, tt.want.TestPlan))
			}
			assert.Equal(t, tt.want.Reviewed, got.Reviewed)
		})
	}
}
