import '../../ui/base.css'
import { countVisit } from '../../ui/analytics'
import { byId } from '../../ui/dom'
import { mountWorkReportApp } from '../../ui/work-report-app'
import { kinmu } from './config'

countVisit('/kinmu')

mountWorkReportApp(byId('app'), kinmu)
