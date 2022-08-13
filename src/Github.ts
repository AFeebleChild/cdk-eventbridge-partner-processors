import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { Code, Function, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface GitHubProps {

  /**
   * SM Secret containing the secret string used to validate webhook events.
   */
  readonly gitHubWebhookSecret: ISecret;

  /**
   * Eventbus to send GitHub events to.
   */
  readonly eventBus: IEventBus;

  /**
   * Maximum number of concurrent invocations on the fURL function before triggering the alarm.
   */
  readonly lambdaInvocationAlarmThreshold: number;

}

/**
 * CDK wrapper for the GitHub Eventbridge processor.
 * @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-saas-furls.html#furls-connection-github
 */
export class GitHubEventProcessor extends Construct {
  private githubEventsFunction: Function;
  constructor(scope: Construct, id: string, props: GitHubProps) {
    super(scope, id);

    this.githubEventsFunction = new Function(this, 'GitHubEventsFunction', {
      code: Code.fromBucket(Bucket.fromBucketName(this, 'AWSFunctionBucket', `eventbridge-inbound-webhook-templates-prod-${Stack.of(this).region}`), 'lambda-templates/github-lambdasrc.zip'),
      handler: 'app.handler',
      runtime: Runtime.PYTHON_3_7,
      memorySize: 128,
      timeout: Duration.seconds(100),
      reservedConcurrentExecutions: 10,
      environment: {
        GITHUB_WEBHOOK_SECRET_ARN: props.gitHubWebhookSecret.secretArn,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
    });

    const fURL = this.githubEventsFunction.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    props.gitHubWebhookSecret.grantRead(this.githubEventsFunction);
    props.eventBus.grantPutEventsTo(this.githubEventsFunction);

    new CfnOutput(this, 'GitHubFunctionUrl', { value: fURL.url });
  }
}