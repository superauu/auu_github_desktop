import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import hudson.model.ChoiceParameterDefinition
import hudson.model.Job
import hudson.model.ParametersDefinitionProperty
import hudson.model.StringParameterDefinition
import hudson.security.GlobalMatrixAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import jenkins.security.ApiTokenProperty
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def instance = Jenkins.get()
def localDir = new File('/run/auugit-local')
def connectionFile = new File(localDir, 'connection.json')
def previous = connectionFile.exists() ? new JsonSlurper().parse(connectionFile) : [:]
def realm = instance.securityRealm instanceof HudsonPrivateSecurityRealm
    ? instance.securityRealm : new HudsonPrivateSecurityRealm(false)
instance.setSecurityRealm(realm)

def users = [:]
['admin', 'auugit', 'auugit-reader'].each { username ->
    def password = new File(localDir, username + '.password').text.trim()
    // createAccount updates password details on an existing user without replacing API tokens.
    def user = realm.createAccount(username, password)
    def tokenProperty = user.getProperty(ApiTokenProperty)
    if (tokenProperty == null) {
        tokenProperty = new ApiTokenProperty()
        user.addProperty(tokenProperty)
    }
    def oldToken = previous.users?.get(username)?.apiToken
    def token = oldToken && tokenProperty.tokenStore.findMatchingToken(oldToken) != null
        ? oldToken : tokenProperty.tokenStore.generateNewToken('AuuGit local integration').plainValue
    user.save()
    users[username] = [username: username, password: password, apiToken: token]
}

def permissions = new GlobalMatrixAuthorizationStrategy()
permissions.add(Jenkins.ADMINISTER, 'admin')
['auugit', 'auugit-reader'].each { username ->
    permissions.add(Jenkins.READ, username)
    permissions.add(Job.READ, username)
}
permissions.add(Job.BUILD, 'auugit')
permissions.add(Job.CANCEL, 'auugit')
instance.setAuthorizationStrategy(permissions)
instance.setNumExecutors(1)
instance.setLabelString('auugit-fixture')
instance.setSlaveAgentPort(-1)
JenkinsLocationConfiguration.get().setUrl(System.getenv('AUUGIT_JENKINS_URL'))

def job = instance.getItem('auugit-mock')
if (job == null) job = instance.createProject(WorkflowJob, 'auugit-mock')
job.setDescription('Local AuuGit integration fixture. Simulates CI only; no application build, publish, SCM polling or GitHub webhook.')
job.setDefinition(new CpsFlowDefinition(new File('/opt/auugit-fixture/Jenkinsfile').text, true))
// Register parameters before the first run so buildWithParameters is immediately usable.
job.removeProperty(ParametersDefinitionProperty)
job.addProperty(new ParametersDefinitionProperty([
    new ChoiceParameterDefinition('SCENARIO', ['success', 'failure', 'unstable', 'long', 'log-heavy'] as String[], 'Simulated build outcome'),
    new StringParameterDefinition('COMMIT_SHA', '', 'Correlation metadata only; does not perform a Git checkout'),
    new StringParameterDefinition('BRANCH', 'main', 'Simulated branch'),
    new StringParameterDefinition('REPOSITORY_URL', '', 'Optional repository correlation metadata'),
    new StringParameterDefinition('LONG_SECONDS', '120', 'Long scenario duration: 10-600 seconds'),
    new StringParameterDefinition('LOG_LINES', '1000', 'Log-heavy scenario output: 1-10000 lines')
]))
job.save()
instance.save()

def connection = [url: System.getenv('AUUGIT_JENKINS_URL'), job: 'auugit-mock', users: users]
def temporary = new File(localDir, 'connection.json.tmp')
temporary.setText(JsonOutput.prettyPrint(JsonOutput.toJson(connection)), 'UTF-8')
java.nio.file.Files.move(temporary.toPath(), connectionFile.toPath(),
    java.nio.file.StandardCopyOption.REPLACE_EXISTING)
println('AuuGit fixture ready: job auugit-mock; credentials saved to local ignored connection.json')
