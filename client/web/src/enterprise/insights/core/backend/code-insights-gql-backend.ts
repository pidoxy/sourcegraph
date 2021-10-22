import { ApolloClient, gql } from '@apollo/client'
import { Duration } from 'date-fns'
import { from, Observable, of, throwError } from 'rxjs'
import { LineChartContent, PieChartContent } from 'sourcegraph'

import { ViewContexts } from '@sourcegraph/shared/src/api/extension/extensionHostApi'
import { isDefined } from '@sourcegraph/shared/src/util/types'

import {
    CreateInsightResult,
    LineChartSearchInsightDataSeriesInput,
    LineChartSearchInsightInput,
    TimeIntervalStepUnit,
} from '../../../../graphql-operations'
import { InsightType, isSearchBasedInsight, SearchBasedInsight } from '../types'
import { isSearchBackendBasedInsight } from '../types/insight/search-insight'
import { SupportedInsightSubject } from '../types/subjects'

import { getLangStatsInsightContent } from './api/get-lang-stats-insight-content'
import { getRepositorySuggestions } from './api/get-repository-suggestions'
import { getResolvedSearchRepositories } from './api/get-resolved-search-repositories'
import { getSearchInsightContent } from './api/get-search-insight-content/get-search-insight-content'
import { CodeInsightsBackend } from './code-insights-backend'
import {
    GetLangStatsInsightContentInput,
    GetSearchInsightContentInput,
    InsightCreateInput,
} from './code-insights-backend-types'

const errorMockMethod = (methodName: string) => () => throwError(new Error(`Implement ${methodName} method first`))

function getStepInterval(insight: SearchBasedInsight): [TimeIntervalStepUnit, number] {
    if (insight.type === InsightType.Backend) {
        return [TimeIntervalStepUnit.WEEK, 2]
    }

    const castUnits = (Object.keys(insight.step) as (keyof Duration)[])
        .map<[TimeIntervalStepUnit, number] | null>(key => {
            switch (key) {
                case 'hours': return [TimeIntervalStepUnit.HOUR, insight.step[key] ?? 0]
                case 'days': return [TimeIntervalStepUnit.DAY, insight.step[key] ?? 0]
                case 'weeks': return [TimeIntervalStepUnit.WEEK, insight.step[key] ?? 0]
                case 'months': return [TimeIntervalStepUnit.MONTH, insight.step[key] ?? 0]
                case 'years': return [TimeIntervalStepUnit.YEAR, insight.step[key] ?? 0]
            }

            return null
        })
        .filter(isDefined)

    if (castUnits.length === 0) {
        throw new Error('Wrong time step format')
    }

    // Return first valid match
    return castUnits[0]
}

export class CodeInsightsGqlBackend implements CodeInsightsBackend {

    constructor(private apolloClient: ApolloClient<object>) {}

    // Insights
    public getInsights = errorMockMethod('getInsights')
    public getInsightById = errorMockMethod('getInsightById')
    public findInsightByName = errorMockMethod('findInsightByName')
    public getReachableInsights = errorMockMethod('getReachableInsights')
    public getBackendInsightData = errorMockMethod('getBackendInsightData')
    public getBuiltInInsightData = errorMockMethod('getBuiltInInsightData')

    // We don't have insight visibility and subject levels in the new GQL API anymore.
    // it was part of setting-cascade based API.
    public getInsightSubjects = (): Observable<SupportedInsightSubject[]> => of([])

    public getSubjectSettingsById = errorMockMethod('getSubjectSettingsById')

    public createInsight = (input: InsightCreateInput): Observable<unknown> => {
        const { insight, dashboard } = input

        if (isSearchBasedInsight(insight)) {

            // Prepare repository insight array
            const repositories = !isSearchBackendBasedInsight(insight)
                ? insight.repositories
                : []

            const [unit, value] = getStepInterval(insight)
            const input: LineChartSearchInsightInput = {
                dataSeries: insight.series.map<LineChartSearchInsightDataSeriesInput>(series => ({
                    query: series.query,
                    options: {
                        label: series.name,
                        lineColor: series.stroke
                    },
                    repositoryScope: { repositories },
                    timeScope: { stepInterval: { unit, value } }
                })),
                options: { title: insight.title }
            }

            return from((async () => {
                const { data } = await this.apolloClient.mutate<CreateInsightResult>({
                    mutation: gql`
                        mutation CreateInsight($input: LineChartSearchInsightInput!) {
                            createLineChartSearchInsight(input: $input) {
                                view {
                                    id
                                }
                            }
                        }
                    `,
                    variables: { input }
                })

                // TODO [VK] add attach to dashboard API call with newly create id and dashboard id
                const insightId = data?.createLineChartSearchInsight.view.id ?? ''
                const dashboardId = dashboard?.id ?? ''

                console.log(`Add insight with id ${insightId} to dashboard with id ${dashboardId}`)
            })())
        }

        // TODO [VK] implement lang stats chart creation
        return of()
    }

    public createInsightWithNewFilters = errorMockMethod('createInsightWithNewFilters')
    public updateInsight = errorMockMethod('updateInsight')
    public deleteInsight = errorMockMethod('deleteInsight')

    // Dashboards
    public getDashboards = errorMockMethod('getDashboards')

    // TODO [VK]: Omit for now usage of dashboard info in the creation UI.
    // We have to implement and merge that after the dashboard page migration will be ready.
    public getDashboardById = (): Observable<null> => of(null)

    public findDashboardByName = errorMockMethod('findDashboardByName')
    public createDashboard = errorMockMethod('createDashboard')
    public deleteDashboard = errorMockMethod('deleteDashboard')
    public updateDashboard = errorMockMethod('updateDashboard')

    // Live preview fetchers
    public getSearchInsightContent = <D extends keyof ViewContexts>(
        input: GetSearchInsightContentInput<D>
    ): Promise<LineChartContent<any, string>> => getSearchInsightContent(input.insight, input.options)

    public getLangStatsInsightContent = <D extends keyof ViewContexts>(
        input: GetLangStatsInsightContentInput<D>
    ): Promise<PieChartContent<any>> => getLangStatsInsightContent(input.insight, input.options)

    // Repositories API
    public getRepositorySuggestions = getRepositorySuggestions
    public getResolvedSearchRepositories = getResolvedSearchRepositories
}
